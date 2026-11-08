import { prisma } from "@/lib/db";
import { invoiceHash, type InvoiceHashInput } from "@/lib/hash";
import { round2 } from "@/lib/money";
import { FiscalError } from "@/lib/errors";
import type { Invoice, InvoiceKind, InvoiceLine, Prisma } from "@prisma/client";

export interface DocLineInput {
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRateId: string;
}

export interface IssueDocumentInput {
  establishmentId: string;
  kind: InvoiceKind;
  seriesCode?: string;
  customerNif?: string;
  customerName?: string;
  rectifiesId?: string;
  lines: DocLineInput[];
  actorId?: string | null;
}

export interface ComputedLine {
  productId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRateId: string;
  taxRatePct: number;
  baseAmount: number;
  taxAmount: number;
  totalAmount: number;
}

export async function ensureSeries(
  establishmentId: string,
  code = "A",
  year = new Date().getFullYear()
) {
  return prisma.invoiceSeries.upsert({
    where: { establishmentId_code_year: { establishmentId, code, year } },
    update: {},
    create: { establishmentId, code, year, nextNumber: 1 },
  });
}

async function computeLines(lines: DocLineInput[]): Promise<ComputedLine[]> {
  const taxRateIds = [...new Set(lines.map((l) => l.taxRateId))];
  const rates = await prisma.taxRate.findMany({
    where: { id: { in: taxRateIds }, active: true },
  });
  const byId = new Map(rates.map((r) => [r.id, r]));
  const now = new Date();
  return lines.map((l) => {
    const rate = byId.get(l.taxRateId);
    if (!rate) throw new FiscalError("TAX_RATE_NOT_FOUND", `Tipo de IVA no encontrado o inactivo: ${l.taxRateId}`);
    if (rate.validTo && rate.validTo <= now)
      throw new FiscalError("TAX_RATE_EXPIRED", `El tipo ${rate.code} no está vigente en la fecha de emisión`);
    if (l.quantity <= 0) throw new FiscalError("INVALID_QUANTITY", "La cantidad debe ser positiva");
    if (l.unitPrice < 0) throw new FiscalError("INVALID_PRICE", "El precio no puede ser negativo");
    const base = round2(l.quantity * l.unitPrice);
    const tax = round2(base * Number(rate.rate));
    return {
      productId: l.productId ?? null,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      taxRateId: l.taxRateId,
      taxRatePct: Number(rate.rate),
      baseAmount: base,
      taxAmount: tax,
      totalAmount: round2(base + tax),
    };
  });
}

function hashInputFor(
  establishmentId: string,
  seriesCode: string,
  number: number,
  kind: InvoiceKind,
  issueDate: Date,
  customerNif: string,
  lines: ComputedLine[],
  totalBase: number,
  totalTax: number,
  total: number,
  previousHash: string
): InvoiceHashInput {
  return {
    establishmentId,
    seriesCode,
    number,
    kind,
    issueDateIso: issueDate.toISOString(),
    customerNif,
    lines: lines.map((l) => ({
      description: l.description,
      quantity: String(l.quantity),
      unitPrice: String(l.unitPrice),
      taxRatePct: l.taxRatePct.toFixed(4),
      baseAmount: l.baseAmount.toFixed(2),
      taxAmount: l.taxAmount.toFixed(2),
      totalAmount: l.totalAmount.toFixed(2),
    })),
    totalBase: totalBase.toFixed(2),
    totalTax: totalTax.toFixed(2),
    total: total.toFixed(2),
    previousHash,
  };
}

export async function issueDocument(
  input: IssueDocumentInput
): Promise<Invoice & { lines: InvoiceLine[] }> {
  const seriesCode = input.seriesCode ?? "A";
  const year = new Date().getFullYear();
  const computed = await computeLines(input.lines);
  if (computed.length === 0) throw new FiscalError("EMPTY_DOCUMENT", "El documento no tiene líneas");
  if (input.kind === "RECTIFICATIVE" && !input.rectifiesId)
    throw new FiscalError("RECTIFY_REQUIRED", "Una factura rectificativa debe referenciar la factura rectificada");

  return prisma.$transaction(async (tx) => {
    const series = await tx.invoiceSeries.upsert({
      where: { establishmentId_code_year: { establishmentId: input.establishmentId, code: seriesCode, year } },
      update: {},
      create: { establishmentId: input.establishmentId, code: seriesCode, year, nextNumber: 1 },
    });
    const last = await tx.invoice.findFirst({
      where: { establishmentId: input.establishmentId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { hash: true },
    });
    const previousHash = last?.hash ?? "";
    const number = series.nextNumber;
    const allocated = await tx.invoiceSeries.updateMany({
      where: { id: series.id, nextNumber: number },
      data: { nextNumber: number + 1 },
    });
    if (allocated.count !== 1)
      throw new FiscalError("SERIES_CONFLICT", "Conflicto de concurrencia al asignar el número de serie");

    const issueDate = new Date();
    const totalBase = round2(computed.reduce((s, l) => s + l.baseAmount, 0));
    const totalTax = round2(computed.reduce((s, l) => s + l.taxAmount, 0));
    const total = round2(totalBase + totalTax);
    const baseByRate: Record<string, number> = {};
    for (const l of computed) {
      const key = l.taxRatePct.toFixed(4);
      baseByRate[key] = round2((baseByRate[key] ?? 0) + l.baseAmount);
    }
    const hash = invoiceHash(
      hashInputFor(
        input.establishmentId,
        seriesCode,
        number,
        input.kind,
        issueDate,
        input.customerNif ?? "",
        computed,
        totalBase,
        totalTax,
        total,
        previousHash
      )
    );

    const lineCreates: Prisma.InvoiceLineCreateWithoutInvoiceInput[] = computed.map((l) => ({
      product: l.productId ? { connect: { id: l.productId } } : undefined,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      taxRate: { connect: { id: l.taxRateId } },
      taxRatePct: l.taxRatePct,
      baseAmount: l.baseAmount,
      taxAmount: l.taxAmount,
      totalAmount: l.totalAmount,
    }));

    const invoice = await tx.invoice.create({
      data: {
        establishmentId: input.establishmentId,
        seriesId: series.id,
        seriesCode,
        number,
        kind: input.kind,
        issueDate,
        customerNif: input.customerNif ?? null,
        customerName: input.customerName ?? null,
        rectifiesId: input.rectifiesId ?? null,
        baseByRate: baseByRate as Prisma.InputJsonValue,
        totalBase,
        totalTax,
        total,
        previousHash: previousHash || null,
        hash,
        lines: { create: lineCreates },
      },
      include: { lines: true },
    });

    if (input.kind === "RECTIFICATIVE" && input.rectifiesId) {
      await tx.invoice.update({
        where: { id: input.rectifiesId },
        data: { status: "RECTIFIED" },
      });
    }

    await tx.outboxEvent.create({
      data: {
        aggregateType: "invoice",
        aggregateId: invoice.id,
        eventType: "invoice.issued",
        payload: { invoiceId: invoice.id, seriesCode, number, kind: input.kind, total },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: "ISSUE_DOCUMENT",
        entityType: "invoice",
        entityId: invoice.id,
        after: { seriesCode, number, kind: input.kind, total, hash },
      },
    });
    return invoice;
  });
}

export interface ChainVerification {
  ok: boolean;
  count: number;
  firstBadInvoiceId: string | null;
}

export async function verifyChain(establishmentId: string): Promise<ChainVerification> {
  const invoices = await prisma.invoice.findMany({
    where: { establishmentId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { lines: true },
  });
  let previousHash = "";
  for (const inv of invoices) {
    const totalBase = Number(inv.totalBase);
    const totalTax = Number(inv.totalTax);
    const total = Number(inv.total);
    const recomputed = invoiceHash({
      establishmentId: inv.establishmentId,
      seriesCode: inv.seriesCode,
      number: inv.number,
      kind: inv.kind,
      issueDateIso: inv.issueDate.toISOString(),
      customerNif: inv.customerNif ?? "",
      lines: inv.lines.map((l) => ({
        description: l.description,
        quantity: String(Number(l.quantity)),
        unitPrice: String(Number(l.unitPrice)),
        taxRatePct: Number(l.taxRatePct).toFixed(4),
        baseAmount: Number(l.baseAmount).toFixed(2),
        taxAmount: Number(l.taxAmount).toFixed(2),
        totalAmount: Number(l.totalAmount).toFixed(2),
      })),
      totalBase: totalBase.toFixed(2),
      totalTax: totalTax.toFixed(2),
      total: total.toFixed(2),
      previousHash,
    });
    if (inv.hash !== recomputed || (inv.previousHash ?? "") !== previousHash) {
      return { ok: false, count: invoices.length, firstBadInvoiceId: inv.id };
    }
    previousHash = inv.hash;
  }
  return { ok: true, count: invoices.length, firstBadInvoiceId: null };
}
