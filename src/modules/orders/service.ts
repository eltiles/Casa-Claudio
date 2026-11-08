import { prisma } from "@/lib/db";
import { FiscalError } from "@/lib/errors";
import type { Order, OrderLine } from "@prisma/client";

export const ORDER_LINE_STATUSES = ["PENDING", "PREPARING", "READY"] as const;
export type OrderLineStatus = (typeof ORDER_LINE_STATUSES)[number];

export async function sendOrder(input: {
  saleId: string;
  actorId?: string | null;
}): Promise<Order & { lines: OrderLine[] }> {
  const sale = await prisma.sale.findUnique({
    where: { id: input.saleId },
    include: { lines: true },
  });
  if (!sale) throw new FiscalError("SALE_NOT_FOUND", "Venta no encontrada");
  if (sale.status !== "OPEN") throw new FiscalError("SALE_NOT_OPEN", `La venta está ${sale.status}`);
  const unsent = sale.lines.filter((l) => !l.sentToKitchenAt);
  if (unsent.length === 0)
    throw new FiscalError("ORDER_ALREADY_SENT", "No hay líneas pendientes de enviar a cocina/barra");

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        establishmentId: sale.establishmentId,
        tableId: sale.tableId,
        saleId: sale.id,
        status: "SENT_TO_KITCHEN",
        sentAt: new Date(),
        lines: {
          create: unsent.map((l) => ({
            product: { connect: { id: l.productId } },
            quantity: Number(l.quantity),
            note: l.description,
            status: "PENDING",
          })),
        },
      },
      include: { lines: true },
    });
    await tx.saleLine.updateMany({
      where: { id: { in: unsent.map((l) => l.id) } },
      data: { sentToKitchenAt: new Date() },
    });
    await tx.outboxEvent.create({
      data: {
        aggregateType: "order",
        aggregateId: order.id,
        eventType: "order.sent",
        payload: { orderId: order.id, saleId: sale.id, lineCount: unsent.length },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: "SEND_ORDER",
        entityType: "order",
        entityId: order.id,
        after: { saleId: sale.id, lineCount: unsent.length },
      },
    });
    return order;
  });
}

export async function setOrderLineStatus(input: {
  lineId: string;
  status: OrderLineStatus;
  actorId?: string | null;
}) {
  if (!ORDER_LINE_STATUSES.includes(input.status))
    throw new FiscalError("INVALID_STATUS", `Estado no válido: ${input.status}`);
  return prisma.$transaction(async (tx) => {
    const line = await tx.orderLine.update({
      where: { id: input.lineId },
      data: { status: input.status },
      include: { order: { include: { lines: true } } },
    });
    if (line.order.lines.every((l) => l.status === "READY")) {
      await tx.order.update({ where: { id: line.orderId }, data: { status: "SERVED" } });
    }
    await tx.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: "SET_ORDER_LINE_STATUS",
        entityType: "orderLine",
        entityId: line.id,
        after: { status: input.status, orderId: line.orderId },
      },
    });
    return line;
  });
}

export interface KitchenOrderDTO {
  id: string;
  status: string;
  sentAt: string | null;
  table: string;
  lines: Array<{ id: string; name: string; quantity: number; status: string; note: string | null }>;
}

export async function listKitchenOrders(establishmentId: string): Promise<KitchenOrderDTO[]> {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const orders = await prisma.order.findMany({
    where: {
      establishmentId,
      createdAt: { gte: dayStart },
      status: { in: ["SENT_TO_KITCHEN", "SERVED"] },
    },
    orderBy: { createdAt: "asc" },
    include: { table: true, lines: { include: { product: true } } },
  });
  return orders.map((o) => ({
    id: o.id,
    status: o.status,
    sentAt: o.sentAt ? o.sentAt.toISOString() : null,
    table: o.table ? o.table.name : "Para llevar",
    lines: o.lines.map((l) => ({
      id: l.id,
      name: l.product.name,
      quantity: Number(l.quantity),
      status: l.status,
      note: l.note,
    })),
  }));
}
