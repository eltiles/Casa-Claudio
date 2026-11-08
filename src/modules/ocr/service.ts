import { prisma } from "@/lib/db";
import { round2 } from "@/lib/money";
import { FiscalError } from "@/lib/errors";
import { applyPostedPurchase } from "@/modules/inventory/service";

export function parseEsNumber(s: string): number {
  return Number(s.replace(/\./g, "").replace(",", "."));
}

export interface ParsedInvoice {
  supplierNif: string | null;
  supplierName: string | null;
  number: string | null;
  date: string | null;
  base: number | null;
  taxPct: number | null;
  tax: number | null;
  total: number | null;
  confidence: number;
  notes: string[];
}

const AMOUNT = "([\\d][\\d.,]*)";

export function parseInvoiceText(text: string): ParsedInvoice {
  const notes: string[] = [];
  const lines = text.split(/\r?\n/);
  const supplierName =
    lines.map((l) => l.trim()).find((l) => l.length > 3 && !/^[0-9.,\s€%]+$/.test(l)) ?? null;

  const nifMatch =
    text.match(/N\.?\s*I\.?\s*F\.?\s*[:.\-]?\s*([A-Z0-9][A-Z0-9-]{7,11})/i) ??
    text.match(/\b([ABCEGHJNPQRSUVW]\d{7}[A-Z0-9])\b/);
  const supplierNif = nifMatch ? nifMatch[1].toUpperCase() : null;

  const dateMatch = text.match(/\b(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})\b/);
  const date = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : null;

  const numMatch = text.match(
    /(?:factura|albar[aá]n)\s*(?:n?[ºo°.]?\s*)?[:#]?\s*([A-Z0-9][A-Z0-9\-/]{2,20})/i
  );
  const number = numMatch ? numMatch[1].toUpperCase() : null;

  const totalMatches = [...text.matchAll(new RegExp(`total[^\\d\\n]*${AMOUNT}\\s*(?:€|EUR|euros)?`, "gi"))];
  const totalMatch = totalMatches.pop();
  let total = totalMatch ? round2(parseEsNumber(totalMatch[1])) : null;

  const baseMatch = text.match(new RegExp(`base\\s+imponible[^\\d\\n]*${AMOUNT}`, "i"));
  let base = baseMatch ? round2(parseEsNumber(baseMatch[1])) : null;

  const ivaMatches = [
    ...text.matchAll(new RegExp(`IVA[^\\d\\n%]*(\\d{1,2}(?:[.,]\\d+)?)\\s*%[^\\d\\n]*${AMOUNT}`, "gi")),
  ];
  let taxPct: number | null = null;
  let tax: number | null = null;
  if (ivaMatches.length) {
    const last = ivaMatches[ivaMatches.length - 1];
    taxPct = round2(Number(last[1].replace(",", ".")) / 100);
    tax = round2(parseEsNumber(last[2]));
  } else {
    const cuotaMatch = text.match(new RegExp(`cuota[^\\d\\n]*IVA[^\\d\\n]*${AMOUNT}`, "i"));
    if (cuotaMatch) {
      tax = round2(parseEsNumber(cuotaMatch[1]));
      if (base && base > 0) taxPct = round2(tax / base);
    }
  }
  if (base !== null && tax !== null && total === null) total = round2(base + tax);
  if (total !== null && base !== null && tax === null) tax = round2(total - base);
  if (total !== null && base === null && tax !== null) base = round2(total - tax);

  const found = [supplierNif, date, number, base, tax, taxPct].filter((x) => x !== null && x !== undefined).length;
  const confidence = round2(found / 6);
  if (!number) notes.push("No si detectó el número de factura");
  if (total === null) notes.push("No se detectó el total");
  if (!supplierNif) notes.push("No se detectó el NIF del proveedor");

  return { supplierNif, supplierName, number, date, base, taxPct, tax, total, confidence, notes };
}

export async function saveOcrDraft(input: {
  establishmentId: string;
  parsed: ParsedInvoice;
  rawText: string;
  actorId?: string | null;
}) {
  const { parsed } = input;
  if (parsed.total === null) throw new FiscalError("OCR_NO_TOTAL", "El OCR no detectó el total; corrígelo antes de guardar");
  const number = parsed.number ?? `OCR-${Date.now()}`;

  return prisma.$transaction(async (tx) => {
    let supplier = parsed.supplierNif
      ? await tx.supplier.findFirst({ where: { establishmentId: input.establishmentId, nif: parsed.supplierNif } })
      : null;
    if (!supplier) {
      supplier = await tx.supplier.create({
        data: {
          establishmentId: input.establishmentId,
          name: parsed.supplierName ?? "Proveedor (OCR)",
          nif: parsed.supplierNif,
        },
      });
    }
    const dup = await tx.purchaseInvoice.findUnique({
      where: { supplierId_number: { supplierId: supplier.id, number } },
    });
    if (dup) throw new FiscalError("DUPLICATE_PURCHASE", `Ya existe la factura ${number} de ${supplier.name}`);

    const base = parsed.base ?? round2((parsed.total ?? 0) / (1 + (parsed.taxPct ?? 0.21)));
    const tax = parsed.tax ?? round2((parsed.total ?? 0) - base);
    const issueDate = parsed.date ? new Date(`${parsed.date}T00:00:00`) : new Date();

    const invoice = await tx.purchaseInvoice.create({
      data: {
        establishmentId: input.establishmentId,
        supplierId: supplier.id,
        number,
        issueDate,
        totalBase: base,
        totalTax: tax,
        total: parsed.total ?? 0,
        ocrRawText: input.rawText.slice(0, 20000),
        ocrConfidence: parsed.confidence,
        status: "DRAFT",
        lines: {
          create: [
            {
              description: `Factura ${number} (OCR, pendiente de asignar a stock)`,
              quantity: 1,
              unitCost: base,
              taxRatePct: parsed.taxPct ?? 0.21,
              baseAmount: base,
              taxAmount: tax,
            },
          ],
        },
      },
      include: { supplier: true, lines: true },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: "OCR_DRAFT_SAVED",
        entityType: "purchaseInvoice",
        entityId: invoice.id,
        after: { number, supplier: supplier.name, total: parsed.total, confidence: parsed.confidence },
      },
    });
    return invoice;
  });
}

export async function approveOcrDraft(input: { id: string; actorId?: string | null }) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.purchaseInvoice.findUnique({
      where: { id: input.id },
      include: { lines: true, supplier: true },
    });
    if (!invoice) throw new FiscalError("NOT_FOUND", "Borrador OCR no encontrado");
    if (invoice.status === "POSTED") return { alreadyPosted: true, id: invoice.id };
    if (Number(invoice.total) <= 0) throw new FiscalError("OCR_NO_TOTAL", "El borrador no tiene total válido");
    await tx.purchaseInvoice.update({
      where: { id: invoice.id },
      data: { status: "POSTED", reviewedById: input.actorId ?? null },
    });
    await applyPostedPurchase(tx, invoice, invoice.establishmentId, input.actorId, "APPROVE_OCR");
    return { alreadyPosted: false, id: invoice.id };
  });
}

export async function listOcrDrafts(establishmentId: string) {
  const drafts = await prisma.purchaseInvoice.findMany({
    where: { establishmentId, status: "DRAFT" },
    include: { supplier: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return drafts.map((d) => ({
    id: d.id,
    number: d.number,
    supplier: d.supplier.name,
    nif: d.supplier.nif,
    issueDate: d.issueDate.toISOString().slice(0, 10),
    total: Number(d.total),
    confidence: d.ocrConfidence === null ? null : Number(d.ocrConfidence),
    createdAt: d.createdAt.toISOString(),
  }));
}
