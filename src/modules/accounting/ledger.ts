import type { PaymentMethod, Prisma } from "@prisma/client";
import { round2 } from "@/lib/money";

export const DEBIT_ACCOUNT_BY_METHOD: Record<PaymentMethod, string> = {
  CASH: "570",
  CARD: "572",
  BIZUM: "572",
  CONTACTLESS: "572",
  OTHER: "572",
};

export interface LedgerSaleLine {
  saleAccountCode: string;
  baseAmount: number;
  taxAmount: number;
  taxRatePct: number;
}

export interface LedgerPayment {
  method: PaymentMethod;
  amount: number;
}

export async function nextLedgerEntryNumber(
  tx: Prisma.TransactionClient,
  establishmentId: string
): Promise<number> {
  return (await tx.ledgerEntry.count({ where: { establishmentId } })) + 1;
}

export async function nextSaleNumber(
  tx: Prisma.TransactionClient,
  establishmentId: string
): Promise<string> {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const countToday = await tx.sale.count({
    where: { establishmentId, createdAt: { gte: dayStart } },
  });
  const yyyymmdd = dayStart.toISOString().slice(0, 10).replace(/-/g, "");
  return `V-${yyyymmdd}-${String(countToday + 1).padStart(4, "0")}`;
}

export async function createSaleLedgerEntry(
  tx: Prisma.TransactionClient,
  params: {
    establishmentId: string;
    saleId: string;
    number: string;
    date: Date;
    lines: LedgerSaleLine[];
    payments: LedgerPayment[];
    actorId?: string | null;
  }
) {
  const entryNumber = await nextLedgerEntryNumber(tx, params.establishmentId);
  const debitByAccount = new Map<string, number>();
  for (const p of params.payments) {
    const code = DEBIT_ACCOUNT_BY_METHOD[p.method];
    debitByAccount.set(code, round2((debitByAccount.get(code) ?? 0) + p.amount));
  }
  const creditByAccount = new Map<string, number>();
  for (const l of params.lines) {
    creditByAccount.set(l.saleAccountCode, round2((creditByAccount.get(l.saleAccountCode) ?? 0) + l.baseAmount));
  }
  const creditTaxByRate = new Map<string, number>();
  for (const l of params.lines) {
    const key = l.taxRatePct.toFixed(4);
    creditTaxByRate.set(key, round2((creditTaxByRate.get(key) ?? 0) + l.taxAmount));
  }

  const entryLines: Prisma.LedgerEntryLineCreateWithoutEntryInput[] = [];
  for (const [code, amount] of debitByAccount) {
    entryLines.push({
      account: { connect: { establishmentId_code: { establishmentId: params.establishmentId, code } } },
      debit: amount,
      credit: 0,
      description: `Cobro venta ${params.number}`,
    });
  }
  for (const [code, amount] of creditByAccount) {
    entryLines.push({
      account: { connect: { establishmentId_code: { establishmentId: params.establishmentId, code } } },
      debit: 0,
      credit: amount,
      description: `Venta ${params.number}`,
    });
  }
  for (const [ratePct, amount] of creditTaxByRate) {
    entryLines.push({
      account: { connect: { establishmentId_code: { establishmentId: params.establishmentId, code: "477" } } },
      debit: 0,
      credit: amount,
      description: `IVA repercutido ${Number(ratePct) * 100}% venta ${params.number}`,
    });
  }

  return tx.ledgerEntry.create({
    data: {
      establishmentId: params.establishmentId,
      number: entryNumber,
      date: params.date,
      description: `Venta ${params.number}`,
      source: "SALE",
      sourceId: params.saleId,
      postedById: params.actorId ?? null,
      lines: { create: entryLines },
    },
  });
}
