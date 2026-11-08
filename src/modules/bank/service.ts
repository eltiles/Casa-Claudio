import { prisma } from "@/lib/db";
import { round2 } from "@/lib/money";
import { FiscalError } from "@/lib/errors";
import { sha256Hex } from "@/lib/hash";
import { DEBIT_ACCOUNT_BY_METHOD, nextLedgerEntryNumber } from "@/modules/accounting/ledger";
import { CASH_LIMIT_EUR } from "@/modules/sales/service";
import type { PaymentMethod } from "@prisma/client";

export async function ensureBankAccount(
  establishmentId: string,
  input: { name: string; bankName?: string; iban?: string }
) {
  if (input.iban) {
    const existing = await prisma.bankAccount.findUnique({
      where: { establishmentId_iban: { establishmentId, iban: input.iban } },
    });
    if (existing) return existing;
  }
  return prisma.bankAccount.create({
    data: {
      establishmentId,
      name: input.name,
      bankName: input.bankName ?? null,
      iban: input.iban ?? null,
    },
  });
}

export interface BankRow {
  date: Date;
  amount: number;
  description: string;
  reference: string | null;
}

export function parseBankCsv(text: string): BankRow[] {
  const rows: BankRow[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^(fecha|date)\b/i.test(line)) continue;
    const delim = line.includes(";") ? ";" : ",";
    const parts = line.split(delim).map((p) => p.trim().replace(/^"|"$/g, ""));
    if (parts.length < 3) continue;
    const [fecha, importe, concepto, referencia] = parts;
    const m = fecha.match(/^(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})$/) ?? fecha.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) continue;
    const date =
      m[1].length === 4
        ? new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`)
        : new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00`);
    const amount = round2(Number(String(importe).replace(",", ".").replace(/[€\s]/g, "")));
    if (!isFinite(amount) || amount === 0) continue;
    rows.push({ date, amount, description: concepto || "Movimiento bancario", reference: referencia || null });
  }
  return rows;
}

export async function importBankCsv(
  establishmentId: string,
  bankAccountId: string,
  text: string,
  actorId?: string | null
): Promise<{ imported: number; skipped: number; reconcile: { matched: number; pending: number } }> {
  const account = await prisma.bankAccount.findFirst({
    where: { id: bankAccountId, establishmentId },
  });
  if (!account) throw new FiscalError("ACCOUNT_NOT_FOUND", "Cuenta bancaria no encontrada");
  const rows = parseBankCsv(text);
  let imported = 0;
  let skipped = 0;
  for (const r of rows) {
    const fingerprint = sha256Hex(
      `${r.date.toISOString().slice(0, 10)}|${r.amount}|${r.description}|${r.reference ?? ""}`
    );
    const existing = await prisma.bankMovement.findUnique({
      where: { bankAccountId_fingerprint: { bankAccountId: account.id, fingerprint } },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.bankMovement.create({
      data: {
        bankAccountId: account.id,
        date: r.date,
        amount: r.amount,
        description: r.description,
        reference: r.reference,
        fingerprint,
      },
    });
    imported++;
  }
  await prisma.auditLog.create({
    data: {
      actorId: actorId ?? null,
      action: "IMPORT_BANK",
      entityType: "bankAccount",
      entityId: account.id,
      after: { imported, skipped },
    },
  });
  const reconcile = await reconcileBank(establishmentId);
  return { imported, skipped, reconcile };
}

export async function reconcileBank(
  establishmentId: string
): Promise<{ matched: number; pending: number }> {
  const movements = await prisma.bankMovement.findMany({
    where: { bankAccount: { establishmentId }, status: "UNMATCHED" },
    orderBy: { date: "asc" },
  });
  let matched = 0;
  for (const mv of movements) {
    const dayStart = new Date(mv.date);
    dayStart.setHours(0, 0, 0, 0);
    const from = new Date(dayStart);
    from.setDate(from.getDate() - 2);
    const to = new Date(dayStart);
    to.setDate(to.getDate() + 2);
    to.setHours(23, 59, 59, 999);
    const amount = Number(mv.amount);
    if (amount > 0) {
      const sale = await prisma.sale.findFirst({
        where: {
          establishmentId,
          status: "PAID",
          closedAt: { gte: from, lte: to },
          payments: { some: { method: { not: "CASH" }, amount } },
        },
        orderBy: { closedAt: "asc" },
      });
      if (sale) {
        await prisma.bankMovement.update({
          where: { id: mv.id },
          data: { status: "MATCHED", matchedSaleId: sale.id },
        });
        await prisma.outboxEvent.create({
          data: {
            aggregateType: "bankMovement",
            aggregateId: mv.id,
            eventType: "bank.matched",
            payload: { bankMovementId: mv.id, saleId: sale.id, amount },
          },
        });
        matched++;
        continue;
      }
    } else {
      const sp = await prisma.supplierPayment.findFirst({
        where: {
          establishmentId,
          paidAt: { gte: from, lte: to },
          amount: Math.abs(amount),
        },
        orderBy: { paidAt: "asc" },
      });
      if (sp) {
        await prisma.bankMovement.update({
          where: { id: mv.id },
          data: { status: "MATCHED", matchedSupplierPaymentId: sp.id },
        });
        matched++;
        continue;
      }
    }
  }
  return { matched, pending: movements.length - matched };
}

export async function listBankMovements(establishmentId: string, limit = 200) {
  const movements = await prisma.bankMovement.findMany({
    where: { bankAccount: { establishmentId } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: Math.min(limit, 500),
    include: { bankAccount: true },
  });
  return movements.map((m) => ({
    id: m.id,
    date: m.date.toISOString().slice(0, 10),
    amount: Number(m.amount),
    description: m.description,
    reference: m.reference,
    status: m.status,
    matchedSaleId: m.matchedSaleId,
    matchedSupplierPaymentId: m.matchedSupplierPaymentId,
    account: m.bankAccount.name,
  }));
}

export async function paySupplier(input: {
  establishmentId: string;
  supplierId: string;
  purchaseInvoiceId?: string | null;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  reference?: string;
  actorId?: string | null;
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidAt))
    throw new FiscalError("INVALID_DATE", "La fecha debe tener formato YYYY-MM-DD");
  if (input.amount <= 0) throw new FiscalError("INVALID_AMOUNT", "El importe debe ser positivo");
  if (input.method === "CASH" && input.amount >= CASH_LIMIT_EUR)
    throw new FiscalError(
      "CASH_LIMIT_1000",
      `Pago en efectivo a proveedor de ${input.amount} €: límite ${CASH_LIMIT_EUR} € (Ley 7/2012, art. 7)`
    );
  const supplier = await prisma.supplier.findFirst({
    where: { id: input.supplierId, establishmentId: input.establishmentId },
  });
  if (!supplier) throw new FiscalError("SUPPLIER_NOT_FOUND", "Proveedor no encontrado");

  return prisma.$transaction(async (tx) => {
    const paidAt = new Date(`${input.paidAt}T00:00:00`);
    const payment = await tx.supplierPayment.create({
      data: {
        establishmentId: input.establishmentId,
        supplierId: supplier.id,
        purchaseInvoiceId: input.purchaseInvoiceId ?? null,
        amount: input.amount,
        method: input.method,
        paidAt,
        reference: input.reference ?? null,
        createdById: input.actorId ?? null,
      },
    });
    const entryNumber = await nextLedgerEntryNumber(tx, input.establishmentId);
    const creditAccount = DEBIT_ACCOUNT_BY_METHOD[input.method];
    await tx.ledgerEntry.create({
      data: {
        establishmentId: input.establishmentId,
        number: entryNumber,
        date: paidAt,
        description: `Pago a proveedor ${supplier.name}`,
        source: "PURCHASE",
        sourceId: payment.id,
        postedById: input.actorId ?? null,
        lines: {
          create: [
            {
              account: { connect: { establishmentId_code: { establishmentId: input.establishmentId, code: "400" } } },
              debit: input.amount,
              credit: 0,
              description: `Pago ${supplier.name}`,
            },
            {
              account: { connect: { establishmentId_code: { establishmentId: input.establishmentId, code: creditAccount } } },
              debit: 0,
              credit: input.amount,
              description: `Salida por ${input.method === "CASH" ? "caja" : "banco"}`,
            },
          ],
        },
      },
    });
    await tx.outboxEvent.create({
      data: {
        aggregateType: "supplierPayment",
        aggregateId: payment.id,
        eventType: "supplier.paid",
        payload: { supplierId: supplier.id, amount: input.amount, method: input.method },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: "PAY_SUPPLIER",
        entityType: "supplierPayment",
        entityId: payment.id,
        after: { supplier: supplier.name, amount: input.amount, method: input.method },
      },
    });
    return payment;
  });
}

export async function listSupplierPayments(establishmentId: string, limit = 100) {
  const payments = await prisma.supplierPayment.findMany({
    where: { establishmentId },
    include: { supplier: true },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
    take: Math.min(limit, 300),
  });
  return payments.map((p) => ({
    id: p.id,
    supplier: p.supplier.name,
    amount: Number(p.amount),
    method: p.method,
    paidAt: p.paidAt.toISOString().slice(0, 10),
    reference: p.reference,
  }));
}
