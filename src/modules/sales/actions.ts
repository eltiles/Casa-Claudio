"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { round2 } from "@/lib/money";
import { createSale } from "@/modules/sales/service";
import { FiscalError } from "@/lib/errors";
import type { PaymentMethod } from "@prisma/client";

export type CreateSaleActionResult =
  | { ok: true; number: string; total: number }
  | { ok: false; error: string; message: string };

export async function createSaleAction(formData: FormData): Promise<CreateSaleActionResult> {
  const session = await auth();
  if (!session?.user?.id || !session.user.establishmentId) {
    return { ok: false, error: "UNAUTHORIZED", message: "Sesión no iniciada" };
  }
  const establishmentId = session.user.establishmentId;
  const actorId = session.user.id;

  const productId = String(formData.get("productId") ?? "");
  const quantity = Number(formData.get("quantity") ?? 1);
  const method = String(formData.get("method") ?? "CASH") as PaymentMethod;

  const product = await prisma.product.findFirst({
    where: { id: productId, establishmentId, active: true },
  });
  if (!product) return { ok: false, error: "PRODUCT_NOT_FOUND", message: "Producto no encontrado" };

  const total = round2(quantity * Number(product.price));

  try {
    const result = await createSale({
      establishmentId,
      idempotencyKey: crypto.randomUUID(),
      waiterId: actorId,
      lines: [{ productId, quantity }],
      payments: [{ method, amount: total }],
      actorId,
    });
    revalidatePath("/dashboard");
    return { ok: true, number: result.sale.number, total: Number(result.sale.total) };
  } catch (error) {
    if (error instanceof FiscalError) return { ok: false, error: error.code, message: error.message };
    console.error(error);
    return { ok: false, error: "INTERNAL_ERROR", message: "Error interno" };
  }
}
