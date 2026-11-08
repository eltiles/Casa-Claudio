import { prisma } from "@/lib/db";
import { round2 } from "@/lib/money";
import { FiscalError } from "@/lib/errors";
import type { PaymentMethod, Prisma, Sale, SaleLine, Payment } from "@prisma/client";
import {
  createSaleLedgerEntry,
  nextSaleNumber,
  type LedgerPayment,
} from "@/modules/accounting/ledger";
import { drainOutbox } from "@/modules/inventory/service";

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

export function validatePayments(payments: PaymentInput[], total: number): void {
  if (!payments.length) throw new FiscalError("EMPTY_PAYMENTS", "La venta no tiene pagos");
  for (const p of payments) {
    if (p.amount <= 0) throw new FiscalError("INVALID_PAYMENT", "El importe del pago debe ser positivo");
    if (p.method === "CASH" && p.amount >= CASH_LIMIT_EUR) {
      throw new FiscalError(
        "CASH_LIMIT_1000",
        `Pago en efectivo de ${p.amount} €: prohibidos pagos en efectivo iguales o superiores a ${CASH_LIMIT_EUR} € cuando interviene un empresario (Ley 7/2012, art. 7, mod. Ley 11/2021)`
      );
    }
  }
  const paymentsSum = round2(payments.reduce((s, p) => s + p.amount, 0));
  if (paymentsSum !== total)
    throw new FiscalError(
      "PAYMENT_MISMATCH",
      `La suma de pagos (${paymentsSum} €) no coincide con el total de la venta (${total} €)`
    );
}

export async function createSale(
  input: CreateSaleInput
): Promise<{ sale: SaleWithRelations; idempotent: boolean }> {
  const existing = await prisma.sale.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: { lines: true, payments: true },
  });
  if (existing) return { sale: existing, idempotent: true };

  if (!input.lines.length) throw new FiscalError("EMPTY_SALE", "La venta no tiene líneas");

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
  validatePayments(input.payments, total);

  const sale = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const number = await nextSaleNumber(tx, input.establishmentId);

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

    await createSaleLedgerEntry(tx, {
      establishmentId: input.establishmentId,
      saleId: created.id,
      number,
      date: dayStart,
      lines: lines.map((l) => ({
        saleAccountCode: l.saleAccountCode,
        baseAmount: l.baseAmount,
        taxAmount: l.taxAmount,
        taxRatePct: l.taxRatePct,
      })),
      payments: input.payments as LedgerPayment[],
      actorId: input.actorId ?? null,
    });

    if (created.tableId) {
      await tx.diningTable.update({ where: { id: created.tableId }, data: { status: "FREE" } });
    }

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
  }).then(async (s) => {
    await drainOutbox().catch(() => {});
    return s;
  });

  return { sale, idempotent: false };
}
