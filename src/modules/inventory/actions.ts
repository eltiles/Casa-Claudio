"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { FiscalError } from "@/lib/errors";
import {
  createPurchaseInvoice,
  drainOutbox,
  saveRecipe,
  type PurchaseLineInput,
} from "@/modules/inventory/service";

const STOCK_ROLES = ["ADMIN", "MANAGER", "ACCOUNTANT"];

type ActionError = { ok: false; error: string; message: string };

async function stockUser() {
  const session = await auth();
  if (!session?.user?.id || !session.user.establishmentId) return null;
  if (!STOCK_ROLES.includes(session.user.role)) return null;
  return { id: session.user.id, establishmentId: session.user.establishmentId };
}

function toError(e: unknown): ActionError {
  if (e instanceof FiscalError) return { ok: false, error: e.code, message: e.message };
  console.error(e);
  return { ok: false, error: "INTERNAL_ERROR", message: "Error interno" };
}

export async function createSupplierAction(input: { name: string; nif?: string }) {
  const u = await stockUser();
  if (!u) return { ok: false as const, error: "UNAUTHORIZED", message: "Sin sesión o sin permiso" };
  try {
    const supplier = await prisma.supplier.create({
      data: {
        establishmentId: u.establishmentId,
        name: input.name.trim(),
        nif: input.nif?.trim() || null,
      },
    });
    revalidatePath("/compras/nueva");
    return { ok: true as const, supplierId: supplier.id };
  } catch (e) {
    return toError(e);
  }
}

export async function createPurchaseAction(input: {
  supplierId: string;
  number: string;
  issueDate: string;
  lines: PurchaseLineInput[];
}) {
  const u = await stockUser();
  if (!u) return { ok: false as const, error: "UNAUTHORIZED", message: "Sin sesión o sin permiso" };
  try {
    const invoice = await createPurchaseInvoice({
      establishmentId: u.establishmentId,
      supplierId: input.supplierId,
      number: input.number.trim(),
      issueDate: input.issueDate,
      lines: input.lines,
      actorId: u.id,
    });
    revalidatePath("/inventario");
    revalidatePath("/compras");
    revalidatePath("/carta");
    return { ok: true as const, purchaseInvoiceId: invoice.id, total: Number(invoice.total) };
  } catch (e) {
    return toError(e);
  }
}

export async function saveRecipeAction(input: {
  productId: string;
  lines: Array<{ stockItemId: string; quantity: number }>;
}) {
  const u = await stockUser();
  if (!u) return { ok: false as const, error: "UNAUTHORIZED", message: "Sin sesión o sin permiso" };
  try {
    const r = await saveRecipe({
      establishmentId: u.establishmentId,
      productId: input.productId,
      lines: input.lines,
      actorId: u.id,
    });
    revalidatePath("/carta");
    return { ok: true as const, costStd: r.costStd };
  } catch (e) {
    return toError(e);
  }
}

export async function drainOutboxAction() {
  const u = await stockUser();
  if (!u) return { ok: false as const, error: "UNAUTHORIZED", message: "Sin sesión o sin permiso" };
  const r = await drainOutbox();
  revalidatePath("/inventario");
  revalidatePath("/dashboard");
  return { ok: true as const, ...r };
}
