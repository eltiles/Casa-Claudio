"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { FiscalError } from "@/lib/errors";
import {
  addSaleLine,
  openSale,
  paySale,
  removeSaleLine,
  setSaleLineQuantity,
} from "@/modules/sales/flow";
import { sendOrder, setOrderLineStatus, type OrderLineStatus } from "@/modules/orders/service";
import type { PaymentMethod } from "@prisma/client";

const TPV_ROLES = ["ADMIN", "MANAGER", "WAITER"];

type ActionError = { ok: false; error: string; message: string };
type ActionOk<T> = T & { ok: true };

async function tpvUser() {
  const session = await auth();
  if (!session?.user?.id || !session.user.establishmentId) return null;
  if (!TPV_ROLES.includes(session.user.role)) return null;
  return { id: session.user.id, establishmentId: session.user.establishmentId };
}

function toError(e: unknown): ActionError {
  if (e instanceof FiscalError) return { ok: false, error: e.code, message: e.message };
  console.error(e);
  return { ok: false, error: "INTERNAL_ERROR", message: "Error interno" };
}

export async function openSaleAction(input: { tableId?: string | null }): Promise<
  ActionOk<{ saleId: string; number: string }> | ActionError
> {
  const u = await tpvUser();
  if (!u) return { ok: false, error: "UNAUTHORIZED", message: "Sin sesión o sin permiso" };
  try {
    const r = await openSale({
      establishmentId: u.establishmentId,
      idempotencyKey: crypto.randomUUID(),
      waiterId: u.id,
      tableId: input.tableId ?? null,
      actorId: u.id,
    });
    revalidatePath("/mesas");
    return { ok: true, saleId: r.sale.id, number: r.sale.number };
  } catch (e) {
    return toError(e);
  }
}

export async function addSaleLineAction(input: {
  saleId: string;
  lineId: string;
  productId: string;
  quantity: number;
}): Promise<ActionOk<{ total: number }> | ActionError> {
  const u = await tpvUser();
  if (!u) return { ok: false, error: "UNAUTHORIZED", message: "Sin sesión o sin permiso" };
  try {
    const sale = await addSaleLine({ ...input, actorId: u.id });
    revalidatePath("/mesas");
    return { ok: true, total: Number(sale.total) };
  } catch (e) {
    return toError(e);
  }
}

export async function setSaleLineQuantityAction(input: {
  saleId: string;
  lineId: string;
  quantity: number;
}): Promise<ActionOk<{ total: number }> | ActionError> {
  const u = await tpvUser();
  if (!u) return { ok: false, error: "UNAUTHORIZED", message: "Sin sesión o sin permiso" };
  try {
    const sale = await setSaleLineQuantity({ ...input, actorId: u.id });
    revalidatePath("/mesas");
    return { ok: true, total: Number(sale.total) };
  } catch (e) {
    return toError(e);
  }
}

export async function removeSaleLineAction(input: {
  saleId: string;
  lineId: string;
}): Promise<ActionOk<{ total: number }> | ActionError> {
  const u = await tpvUser();
  if (!u) return { ok: false, error: "UNAUTHORIZED", message: "Sin sesión o sin permiso" };
  try {
    const sale = await removeSaleLine({ ...input, actorId: u.id });
    return { ok: true, total: Number(sale.total) };
  } catch (e) {
    return toError(e);
  }
}

export async function sendOrderAction(input: {
  saleId: string;
}): Promise<ActionOk<{ orderId: string }> | ActionError> {
  const u = await tpvUser();
  if (!u) return { ok: false, error: "UNAUTHORIZED", message: "Sin sesión o sin permiso" };
  try {
    const order = await sendOrder({ saleId: input.saleId, actorId: u.id });
    revalidatePath("/kds");
    return { ok: true, orderId: order.id };
  } catch (e) {
    return toError(e);
  }
}

export interface TicketDTO {
  seriesCode: string;
  number: number;
  issueDate: string;
  total: number;
  totalBase: number;
  totalTax: number;
  hash: string;
  lines: Array<{ description: string; quantity: number; unitPrice: number; totalAmount: number }>;
}

export async function paySaleAction(input: {
  saleId: string;
  payments: Array<{ method: PaymentMethod; amount: number; reference?: string }>;
  idempotencyKey: string;
}): Promise<
  | ActionOk<{ saleNumber: string; alreadyPaid: boolean; ticket: TicketDTO }>
  | ActionError
> {
  const u = await tpvUser();
  if (!u) return { ok: false, error: "UNAUTHORIZED", message: "Sin sesión o sin permiso" };
  try {
    const r = await paySale({ saleId: input.saleId, payments: input.payments, actorId: u.id });
    revalidatePath("/mesas");
    revalidatePath("/dashboard");
    const inv = r.invoice;
    const ticket: TicketDTO = inv
      ? {
          seriesCode: inv.seriesCode,
          number: inv.number,
          issueDate: inv.issueDate.toISOString(),
          total: Number(inv.total),
          totalBase: Number(inv.totalBase),
          totalTax: Number(inv.totalTax),
          hash: inv.hash,
          lines: inv.lines.map((l) => ({
            description: l.description,
            quantity: Number(l.quantity),
            unitPrice: Number(l.unitPrice),
            totalAmount: Number(l.totalAmount),
          })),
        }
      : {
          seriesCode: "-",
          number: 0,
          issueDate: new Date().toISOString(),
          total: Number(r.sale.total),
          totalBase: Number(r.sale.totalBase),
          totalTax: Number(r.sale.totalTax),
          hash: "",
          lines: [],
        };
    return { ok: true, saleNumber: r.sale.number, alreadyPaid: r.alreadyPaid, ticket };
  } catch (e) {
    return toError(e);
  }
}

export async function setOrderLineStatusAction(input: {
  lineId: string;
  status: OrderLineStatus;
}): Promise<ActionOk<{ orderId: string }> | ActionError> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "UNAUTHORIZED", message: "Sin sesión" };
  try {
    const line = await setOrderLineStatus({ lineId: input.lineId, status: input.status, actorId: session.user.id });
    return { ok: true, orderId: line.orderId };
  } catch (e) {
    return toError(e);
  }
}
