"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { FiscalError } from "@/lib/errors";
import type { PaymentMethod } from "@prisma/client";
import {
  ensureBankAccount,
  importBankCsv,
  paySupplier,
  reconcileBank,
} from "@/modules/bank/service";

const ROLES = ["ADMIN", "MANAGER", "ACCOUNTANT"];

async function bankUser() {
  const session = await auth();
  if (!session?.user?.id || !session.user.establishmentId) return null;
  if (!ROLES.includes(session.user.role)) return null;
  return { id: session.user.id, establishmentId: session.user.establishmentId };
}

function toError(e: unknown) {
  if (e instanceof FiscalError) return { ok: false as const, error: e.code, message: e.message };
  console.error(e);
  return { ok: false as const, error: "INTERNAL_ERROR", message: "Error interno" };
}

export async function createAccountAction(input: { name: string; bankName?: string; iban?: string }) {
  const u = await bankUser();
  if (!u) return { ok: false as const, error: "UNAUTHORIZED", message: "Sin sesión o sin permiso" };
  if (!input.name.trim()) return { ok: false as const, error: "NAME_REQUIRED", message: "Indica un nombre" };
  const account = await ensureBankAccount(u.establishmentId, input);
  revalidatePath("/banca");
  return { ok: true as const, accountId: account.id };
}

export async function importBankAction(input: { accountId: string; text: string }) {
  const u = await bankUser();
  if (!u) return { ok: false as const, error: "UNAUTHORIZED", message: "Sin sesión o sin permiso" };
  try {
    const r = await importBankCsv(u.establishmentId, input.accountId, input.text, u.id);
    revalidatePath("/banca");
    return { ok: true as const, ...r };
  } catch (e) {
    return toError(e);
  }
}

export async function reconcileAction() {
  const u = await bankUser();
  if (!u) return { ok: false as const, error: "UNAUTHORIZED", message: "Sin sesión o sin permiso" };
  const r = await reconcileBank(u.establishmentId);
  revalidatePath("/banca");
  return { ok: true as const, ...r };
}

export async function paySupplierAction(input: {
  supplierId: string;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  reference?: string;
}) {
  const u = await bankUser();
  if (!u) return { ok: false as const, error: "UNAUTHORIZED", message: "Sin sesión o sin permiso" };
  try {
    const payment = await paySupplier({
      establishmentId: u.establishmentId,
      supplierId: input.supplierId,
      amount: input.amount,
      method: input.method,
      paidAt: input.paidAt,
      reference: input.reference,
      actorId: u.id,
    });
    revalidatePath("/banca");
    revalidatePath("/contabilidad");
    revalidatePath("/informes");
    return { ok: true as const, paymentId: payment.id };
  } catch (e) {
    return toError(e);
  }
}
