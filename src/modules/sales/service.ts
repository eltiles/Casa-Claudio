import { prisma } from "@/lib/db";
import { round2 } from "@/lib/money";
import { FiscalError } from "@/lib/errors";
import type { PaymentMethod, Prisma, Sale, SaleLine, Payment } from "@prisma/client";

export const CASH_LIMIT_EUR = 1000;

export interface SaleLineInput {
  productId: string;
  quantity: number;
}

export interface PaymentInput {
  method: PaymentMethod;
  amount: number;
  reference?: string;
}

export interface CreateSaleInput {
  establishmentId: string;
  idempotencyKey: string;
  waiterId?: string | null;
  tableId?: string | null;
  lines: SaleLineInput[];
  payments: PaymentInput[];
  actorId?: string | null;
}

export type SaleWithRelations = Sale & { lines: SaleLine[]; payments: Payment[] };

const DEBIT_ACCOUNT_BY_METHOD: Record<PaymentMethod, string> = {
  CASH: "570",
  CARD: "572",
  BIZUM: "572",
  CONTACTLESS: "572",
  OTHER: "572",
};

export async function createSale(
  input: CreateSaleInput
): Promise<{ sale: SaleWithRelations; idempotent: boolean }> {
  const existing = await prisma.sale.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: { lines: true, payments: true },
  });
  if (existing) return { sale: existing, idempotent: true };

  if (!input.lines.length) throw new FiscalError("EMPTY_SALE", "La venta no tiene líneas");
  if (!input.payments.length) throw new FiscalError("EMPTY_PAYMENTS", "La venta no tiene pagos");
  for (const p of input.payments) {
    if (p.amount <= 0) throw new FiscalError("INVALID_PAYMENT", "El importe del pago debe ser positivo");
    if (p.method === "CASH" && p.amount >= CASH_LIMIT_EUR) {
      throw new FiscalError(
        "CASH_LIMIT_1000",
        `Pago en efectivo de ${p.amount} €: prohibidos pagos en efectivo iguales o superiores a ${CASH_LIMIT_EUR} € cuando interviene un empresario (Ley 7/2012, art. 7, mod. Ley 11/2021)`
      );
    }
  }

  const productIds = [...new Set(input.lines.map((l) => l.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, establishmentId: input.establishmentId, active: true },
    include: { taxRate: true },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  const lines = input.lines.map((l) => {
    const product = productById.get(l.productId);
    if (!product) throw new FiscalError("PRODUCT_NOT_FOUND", `Producto no encontrado o inactivo: ${l.productId}`);
    if (l.quantity <= 0) throw new FiscalError("INVALID_QUANTITY", "La cantidad debe ser positiva");
    const unitPrice = Number(product.price);
    const rate = Number(product.taxRate.rate);
    const base = round2(l.quantity * unitPrice);
    const tax = round2(base * rate);
    return {
      productId: product.id,
      description: product.name,
      quantity: l.quantity,
      unitPrice,
      taxRateId: product.taxRateId,
      taxRatePct: rate,
      baseAmount: base,
      taxAmount: tax,
      totalAmount: round2(base + tax),
      saleAccountCode: product.saleAccountCode,
    };
  });

  const totalBase = round2(lines.reduce((s, l) => s + l.baseAmount, 0));
  const totalTax = round2(lines.reduce((s, l) => s + l.taxAmount, 0));
  const total = round2(totalBase + totalTax);
  const paymentsSum = round2(input.payments.reduce((s, p) => s + p.amount, 0));
  if (paymentsSum !== total)
    throw new FiscalError(
      "PAYMENT_MISMATCH",
      `La suma de pagos (${paymentsSum} €) no coincide con el total de la venta (${total} €)`
    );

  const sale = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const countToday = await tx.sale.count({
      where: { establishmentId: input.establishmentId, createdAt: { gte: dayStart } },
    });
    const yyyymmdd = dayStart.toISOString().slice(0, 10).replace(/-/g, "");
    const number = `V-${yyyymmdd}-${String(countToday + 1).padStart(4, "0")}`;

    const created = await tx.sale.create({
      data: {
        establishmentId: input.establishmentId,
        idempotencyKey: input.idempotencyKey,
        number,
        status: "PAID",
        tableId: input.tableId ?? null,
        waiterId: input.waiterId ?? null,
        closedAt: now,
        totalBase,
        totalTax,
        total,
        lines: {
          create: lines.map((l) => ({
            product: { connect: { id: l.productId } },
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            taxRate: { connect: { id: l.taxRateId } },
            taxRatePct: l.taxRatePct,
            baseAmount: l.baseAmount,
            taxAmount: l.taxAmount,
            totalAmount: l.totalAmount,
          })),
        },
      },
    });

    for (const p of input.payments) {
      await tx.payment.create({
        data: {
          saleId: created.id,
          method: p.method,
          amount: p.amount,
          reference: p.reference ?? null,
          createdBy: input.actorId ?? null,
        },
      });
    }

    const entryNumber = (await tx.ledgerEntry.count({ where: { establishmentId: input.establishmentId } })) + 1;
    const debitByAccount = new Map<string, number>();
    for (const p of input.payments) {
      const code = DEBIT_ACCOUNT_BY_METHOD[p.method];
      debitByAccount.set(code, round2((debitByAccount.get(code) ?? 0) + p.amount));
    }
    const creditByAccount = new Map<string, number>();
    for (const l of lines) {
      creditByAccount.set(l.saleAccountCode, round2((creditByAccount.get(l.saleAccountCode) ?? 0) + l.baseAmount));
    }
    const creditTaxByRate = new Map<string, number>();
    for (const l of lines) {
      const key = l.taxRatePct.toFixed(4);
      creditTaxByRate.set(key, round2((creditTaxByRate.get(key) ?? 0) + l.taxAmount));
    }

    const entryLines: Prisma.LedgerEntryLineCreateWithoutEntryInput[] = [];
    for (const [code, amount] of debitByAccount) {
      entryLines.push({
        account: { connect: { establishmentId_code: { establishmentId: input.establishmentId, code } } },
        debit: amount,
        credit: 0,
        description: `Cobro venta ${number}`,
      });
    }
    for (const [code, amount] of creditByAccount) {
      entryLines.push({
        account: { connect: { establishmentId_code: { establishmentId: input.establishmentId, code } } },
        debit: 0,
        credit: amount,
        description: `Venta ${number}`,
      });
    }
    for (const [ratePct, amount] of creditTaxByRate) {
      entryLines.push({
        account: { connect: { establishmentId_code: { establishmentId: input.establishmentId, code: "477" } } },
        debit: 0,
        credit: amount,
        description: `IVA repercutido ${Number(ratePct) * 100}% venta ${number}`,
      });
    }

    await tx.ledgerEntry.create({
      data: {
        establishmentId: input.establishmentId,
        number: entryNumber,
        date: dayStart,
        description: `Venta ${number}`,
        source: "SALE",
        sourceId: created.id,
        postedById: input.actorId ?? null,
        lines: { create: entryLines },
      },
    });

    await tx.outboxEvent.create({
      data: {
        aggregateType: "sale",
        aggregateId: created.id,
        eventType: "sale.confirmed",
        payload: {
          saleId: created.id,
          number,
          lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
          totalBase,
          totalTax,
          total,
        },
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: "CREATE_SALE",
        entityType: "sale",
        entityId: created.id,
        after: { number, total, totalBase, totalTax },
      },
    });

    return tx.sale.findUniqueOrThrow({
      where: { id: created.id },
      include: { lines: true, payments: true },
    });
  });

  return { sale, idempotent: false };
}
