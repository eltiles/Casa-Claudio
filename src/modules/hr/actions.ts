"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { FiscalError } from "@/lib/errors";
import type { Role } from "@prisma/client";
import { clockIn, clockOut, createUser, updateUser } from "@/modules/hr/service";

const ADMIN_ROLES = ["ADMIN", "MANAGER"];

async function sessionUser() {
  const session = await auth();
  if (!session?.user?.id || !session.user.establishmentId) return null;
  return { id: session.user.id, role: session.user.role, establishmentId: session.user.establishmentId };
}

function toError(e: unknown) {
  if (e instanceof FiscalError) return { ok: false as const, error: e.code, message: e.message };
  console.error(e);
  return { ok: false as const, error: "INTERNAL_ERROR", message: "Error interno" };
}

export async function clockInAction() {
  const u = await sessionUser();
  if (!u) return { ok: false as const, error: "UNAUTHORIZED", message: "Sin sesión" };
  const r = await clockIn(u.establishmentId, u.id);
  revalidatePath("/turnos");
  return { ok: true as const, alreadyOpen: r.alreadyOpen, start: r.shift.start.toISOString() };
}

export async function clockOutAction() {
  const u = await sessionUser();
  if (!u) return { ok: false as const, error: "UNAUTHORIZED", message: "Sin sesión" };
  try {
    const r = await clockOut(u.establishmentId, u.id);
    revalidatePath("/turnos");
    return { ok: true as const, end: r.shift.end?.toISOString() ?? null };
  } catch (e) {
    return toError(e);
  }
}

export async function createUserAction(input: {
  name: string;
  email: string;
  password: string;
  role: Role;
  pin?: string;
}) {
  const u = await sessionUser();
  if (!u || !ADMIN_ROLES.includes(u.role))
    return { ok: false as const, error: "FORBIDDEN", message: "Solo ADMIN/MANAGER" };
  try {
    const r = await createUser({ establishmentId: u.establishmentId, ...input, actorId: u.id });
    revalidatePath("/personal");
    return { ok: true as const, ...r };
  } catch (e) {
    return toError(e);
  }
}

export async function updateUserAction(input: {
  id: string;
  role?: Role;
  active?: boolean;
  pin?: string;
}) {
  const u = await sessionUser();
  if (!u || !ADMIN_ROLES.includes(u.role))
    return { ok: false as const, error: "FORBIDDEN", message: "Solo ADMIN/MANAGER" };
  try {
    const r = await updateUser({ establishmentId: u.establishmentId, ...input, actorId: u.id });
    revalidatePath("/personal");
    return { ok: true as const, ...r };
  } catch (e) {
    return toError(e);
  }
}
