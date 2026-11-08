import { prisma } from "@/lib/db";
import { round2 } from "@/lib/money";
import { FiscalError } from "@/lib/errors";
import type { Invoice, InvoiceLine, Prisma, Sale, SaleLine } from "@prisma/client";
import { createSaleLedgerEntry, nextSaleNumber } from "@/modules/accounting/ledger";
import { issueDocumentTx } from "@/modules/fiscal/service";
import { CASH_LIMIT_EUR, validatePayments, type PaymentInput } from "@/modules/sales/service";
import { drainOutbox } from "@/modules/inventory/service";

export type SaleWithLines = Sale & { lines: SaleLine[] };

export async function openSale(input: {
  establishmentId: string;
  idempotencyKey: string;
  waiterId?: string | null;
  tableId?: string | null;
  actorId?: string | null;
}): Promise<{ sale: SaleWithLines; idempotent: boolean }> {
  const existing = await prisma.sale.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: { lines: true },
  });
  if (existing) return { sale: existing, idempotent: true };

  return prisma.$transaction(async (tx) => {
    const number = await nextSaleNumber(tx, input.establishmentId);
    const created = await tx.sale.create({
      data: {
        establishmentId: input.establishmentId,
        idempotencyKey: input.idempotencyKey,
        number,
        status: "OPEN",
        tableId: input.tableId ?? null,
        waiterId: input.waiterId ?? null,
      },
      include: { lines: true },
    });
    if (created.tableId) {
      const occupied = await tx.diningTable.updateMany({
        where: { id: created.tableId, status: "FREE" },
        data: { status: "OCCUPIED" },
      });
      if (occupied.count !== 1)
        throw new FiscalError("TABLE_NOT_FREE", "La mesa ya está ocupada");
    }
    await tx.outboxEvent.create({
      data: {
        aggregateType: "sale",
        aggregateId: created.id,
        eventType: "sale.opened",
        payload: { saleId: created.id, number, tableId: created.tableId },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: "OPEN_SALE",
        entityType: "sale",
        entityId: created.id,
        after: { number, tableId: created.tableId },
      },
    });
    return { sale: created, idempotent: false };
  });
}

async function recomputeTotals(tx: Prisma.TransactionClient, saleId: string): Promise<void> {
  const agg = await tx.saleLine.aggregate({
    where: { saleId },
    _sum: { baseAmount: true, taxAmount: true, totalAmount: true },
  });
  await tx.sale.update({
    where: { id: saleId },
    data: {
      totalBase: Number(agg._sum.baseAmount ?? 0),
      totalTax: Number(agg._sum.taxAmount ?? 0),
      total: Number(agg._sum.totalAmount ?? 0),
    },
  });
}

async function getOpenSale(tx: Prisma.TransactionClient, saleId: string) {
  const sale = await tx.sale.findUnique({ where: { id: saleId } });
  if (!sale) throw new FiscalError("SALE_NOT_FOUND", "Venta no encontrada");
  if (sale.status !== "OPEN") throw new FiscalError("SALE_NOT_OPEN", `La venta está ${sale.status}`);
  return sale;
}

export async function addSaleLine(input: {
  saleId: string;
  lineId: string;
  productId: string;
  quantity: number;
  actorId?: string | null;
}): Promise<SaleWithLines> {
  if (input.quantity <= 0) throw new FiscalError("INVALID_QUANTITY", "La cantidad debe ser positiva");
  return prisma.$transaction(async (tx) => {
    const sale = await getOpenSale(tx, input.saleId);
    const product = await tx.product.findFirst({
      where: { id: input.productId, establishmentId: sale.establishmentId, active: true },
      include: { taxRate: true },
    });
    if (!product) throw new FiscalError("PRODUCT_NOT_FOUND", `Producto no encontrado o inactivo: ${input.productId}`);
    const unitPrice = Number(product.price);
    const rate = Number(product.taxRate.rate);
    const base = round2(input.quantity * unitPrice);
    const tax = round2(base * rate);
    const lineData = {
      description: product.name,
      quantity: input.quantity,
      unitPrice,
      taxRatePct: rate,
      baseAmount: base,
      taxAmount: tax,
      totalAmount: round2(base + tax),
    };
    await tx.saleLine.upsert({
      where: { id: input.lineId },
      update: { ...lineData, product: { connect: { id: product.id } }, taxRate: { connect: { id: product.taxRateId } } },
      create: {
        id: input.lineId,
        sale: { connect: { id: sale.id } },
        product: { connect: { id: product.id } },
        taxRate: { connect: { id: product.taxRateId } },
        ...lineData,
      },
    });
    await recomputeTotals(tx, sale.id);
    if (sale.tableId) {
      await tx.diningTable.update({ where: { id: sale.tableId }, data: { status: "OCCUPIED" } });
    }
    await tx.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: "ADD_SALE_LINE",
        entityType: "sale",
        entityId: sale.id,
        after: { lineId: input.lineId, productId: product.id, quantity: input.quantity },
      },
    });
    return tx.sale.findUniqueOrThrow({ where: { id: sale.id }, include: { lines: true } });
  });
}

export async function setSaleLineQuantity(input: {
  saleId: string;
  lineId: string;
  quantity: number;
  actorId?: string | null;
}): Promise<SaleWithLines> {
  return prisma.$transaction(async (tx) => {
    const sale = await getOpenSale(tx, input.saleId);
    const line = await tx.saleLine.findUnique({ where: { id: input.lineId } });
    if (!line || line.saleId !== sale.id)
      throw new FiscalError("LINE_NOT_FOUND", "Línea no encontrada en la venta");
    if (input.quantity <= 0) {
      await tx.saleLine.delete({ where: { id: line.id } });
    } else {
      const base = round2(input.quantity * Number(line.unitPrice));
      const tax = round2(base * Number(line.taxRatePct));
      await tx.saleLine.update({
        where: { id: line.id },
        data: { quantity: input.quantity, baseAmount: base, taxAmount: tax, totalAmount: round2(base + tax) },
      });
    }
    await recomputeTotals(tx, sale.id);
    await tx.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: "SET_SALE_LINE_QTY",
        entityType: "sale",
        entityId: sale.id,
        after: { lineId: input.lineId, quantity: input.quantity },
      },
    });
    return tx.sale.findUniqueOrThrow({ where: { id: sale.id }, include: { lines: true } });
  });
}

export async function removeSaleLine(input: {
  saleId: string;
  lineId: string;
  actorId?: string | null;
}): Promise<SaleWithLines> {
  return setSaleLineQuantity({ ...input, quantity: 0 });
}

export interface PaySaleResult {
  sale: Sale & { lines: SaleLine[]; payments: import("@prisma/client").Payment[] };
  invoice: (Invoice & { lines: InvoiceLine[] }) | null;
  alreadyPaid: boolean;
}

export async function paySale(input: {
  saleId: string;
  payments: PaymentInput[];
  actorId?: string | null;
}): Promise<PaySaleResult> {
  const sale = await prisma.sale.findUnique({
    where: { id: input.saleId },
    include: { lines: { include: { product: true } } },
  });
  if (!sale) throw new FiscalError("SALE_NOT_FOUND", "Venta no encontrada");
  if (sale.status === "VOID") throw new FiscalError("SALE_VOID", "La venta está anulada");
  if (sale.status === "PAID") {
    const invoice = await prisma.invoice.findUnique({
      where: { saleId: sale.id },
      include: { lines: true },
    });
    const full = await prisma.sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: { lines: true, payments: true },
    });
    return { sale: full, invoice, alreadyPaid: true };
  }
  if (sale.lines.length === 0) throw new FiscalError("EMPTY_SALE", "La venta no tiene líneas");
  const total = Number(sale.total);
  validatePayments(input.payments, total);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.sale.updateMany({
      where: { id: input.saleId, status: "OPEN" },
      data: { status: "PAID", closedAt: new Date() },
    });
    if (updated.count !== 1) {
      const current = await tx.sale.findUniqueOrThrow({
        where: { id: input.saleId },
        include: { lines: true, payments: true },
      });
      const invoice = await tx.invoice.findUnique({
        where: { saleId: input.saleId },
        include: { lines: true },
      });
      return { sale: current, invoice, alreadyPaid: true };
    }

    for (const p of input.payments) {
      await tx.payment.create({
        data: {
          saleId: sale.id,
          method: p.method,
          amount: p.amount,
          reference: p.reference ?? null,
          createdBy: input.actorId ?? null,
        },
      });
    }

    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    await createSaleLedgerEntry(tx, {
      establishmentId: sale.establishmentId,
      saleId: sale.id,
      number: sale.number,
      date: dayStart,
      lines: sale.lines.map((l) => ({
        saleAccountCode: l.product.saleAccountCode,
        baseAmount: Number(l.baseAmount),
        taxAmount: Number(l.taxAmount),
        taxRatePct: Number(l.taxRatePct),
      })),
      payments: input.payments,
      actorId: input.actorId ?? null,
    });

    const invoice = await issueDocumentTx(tx, {
      establishmentId: sale.establishmentId,
      kind: "SIMPLIFIED",
      seriesCode: "A",
      saleId: sale.id,
      actorId: input.actorId ?? null,
      lines: sale.lines.map((l) => ({
        productId: l.productId,
        description: l.description,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        taxRateId: l.taxRateId,
      })),
    });

    if (sale.tableId) {
      await tx.diningTable.update({ where: { id: sale.tableId }, data: { status: "FREE" } });
    }

    await tx.outboxEvent.create({
      data: {
        aggregateType: "sale",
        aggregateId: sale.id,
        eventType: "sale.confirmed",
        payload: {
          saleId: sale.id,
          number: sale.number,
          invoiceId: invoice.id,
          lines: sale.lines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity) })),
          total,
        },
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: "PAY_SALE",
        entityType: "sale",
        entityId: sale.id,
        after: { number: sale.number, total, invoiceId: invoice.id },
      },
    });

    const fresh = await tx.sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: { lines: true, payments: true },
    });
    return { sale: fresh, invoice, alreadyPaid: false };
  }).then(async (r) => {
    await drainOutbox().catch(() => {});
    return r;
  });
}

export { CASH_LIMIT_EUR };
