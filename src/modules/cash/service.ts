import { prisma } from "@/lib/db";
import { round2 } from "@/lib/money";
import { FiscalError } from "@/lib/errors";
import type { CashClosing, Prisma } from "@prisma/client";

export interface CloseCashInput {
  establishmentId: string;
  date: string;
  countedCash: number;
  openingFloat: number;
  closedById: string;
  notes?: string;
}

export interface CloseCashResult {
  closing: CashClosing;
  cashIn: number;
  expectedCash: number;
  difference: number;
}

export async function closeCash(input: CloseCashInput): Promise<CloseCashResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date))
    throw new FiscalError("INVALID_DATE", "La fecha debe tener formato YYYY-MM-DD");
  if (input.countedCash < 0) throw new FiscalError("INVALID_AMOUNT", "El efectivo contado no puede ser negativo");

  const dayStart = new Date(`${input.date}T00:00:00`);
  const dayEnd = new Date(`${input.date}T23:59:59.999`);

  const payments = await prisma.payment.findMany({
    where: {
      sale: {
        establishmentId: input.establishmentId,
        status: "PAID",
        createdAt: { gte: dayStart, lte: dayEnd },
      },
    },
  });

  const byMethod: Record<string, number> = {};
  let cashIn = 0;
  for (const p of payments) {
    const amount = Number(p.amount);
    byMethod[p.method] = round2((byMethod[p.method] ?? 0) + amount);
    if (p.method === "CASH") cashIn = round2(cashIn + amount);
  }
  const expectedCash = round2(input.openingFloat + cashIn);
  const difference = round2(input.countedCash - expectedCash);

  const closing = await prisma.$transaction(async (tx) => {
    const c = await tx.cashClosing.upsert({
      where: { establishmentId_date: { establishmentId: input.establishmentId, date: dayStart } },
      update: {
        status: "CLOSED",
        openingFloat: input.openingFloat,
        expectedCash,
        countedCash: input.countedCash,
        difference,
        byMethod: byMethod as Prisma.InputJsonValue,
        notes: input.notes ?? null,
        closedById: input.closedById,
        closedAt: new Date(),
      },
      create: {
        establishmentId: input.establishmentId,
        date: dayStart,
        status: "CLOSED",
        openingFloat: input.openingFloat,
        expectedCash,
        countedCash: input.countedCash,
        difference,
        byMethod: byMethod as Prisma.InputJsonValue,
        notes: input.notes ?? null,
        openedById: input.closedById,
        closedById: input.closedById,
        closedAt: new Date(),
      },
    });

    if (difference !== 0) {
      const entryNumber =
        (await tx.ledgerEntry.count({ where: { establishmentId: input.establishmentId } })) + 1;
      const abs = Math.abs(difference);
      const lines: Prisma.LedgerEntryLineCreateWithoutEntryInput[] =
        difference > 0
          ? [
              {
                account: { connect: { establishmentId_code: { establishmentId: input.establishmentId, code: "570" } } },
                debit: abs,
                credit: 0,
                description: `Sobrante de caja ${input.date}`,
              },
              {
                account: { connect: { establishmentId_code: { establishmentId: input.establishmentId, code: "778" } } },
                debit: 0,
                credit: abs,
                description: `Sobrante de caja ${input.date}`,
              },
            ]
          : [
              {
                account: { connect: { establishmentId_code: { establishmentId: input.establishmentId, code: "678" } } },
                debit: abs,
                credit: 0,
                description: `Faltante de caja ${input.date}`,
              },
              {
                account: { connect: { establishmentId_code: { establishmentId: input.establishmentId, code: "570" } } },
                debit: 0,
                credit: abs,
                description: `Faltante de caja ${input.date}`,
              },
            ];
      await tx.ledgerEntry.create({
        data: {
          establishmentId: input.establishmentId,
          number: entryNumber,
          date: dayStart,
          description: `Descuadre de caja ${input.date} (${difference} €)`,
          source: "CASH_CLOSING",
          sourceId: c.id,
          postedById: input.closedById,
          lines: { create: lines },
        },
      });
    }

    await tx.outboxEvent.create({
      data: {
        aggregateType: "cashClosing",
        aggregateId: c.id,
        eventType: "cash.closed",
        payload: { date: input.date, expectedCash, countedCash: input.countedCash, difference, byMethod },
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: input.closedById,
        action: "CLOSE_CASH",
        entityType: "cashClosing",
        entityId: c.id,
        after: { date: input.date, expectedCash, countedCash: input.countedCash, difference },
      },
    });

    return c;
  });

  return { closing, cashIn, expectedCash, difference };
}
