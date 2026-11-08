"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { disableTotp, enableTotp } from "@/modules/hr/service";

export async function enable2FAAction() {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "UNAUTHORIZED", message: "Sin sesión" };
  const result = await enableTotp(session.user.id);
  revalidatePath("/personal");
  return { ok: true as const, ...result };
}

export async function disable2FAAction() {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "UNAUTHORIZED", message: "Sin sesión" };
  await disableTotp(session.user.id);
  revalidatePath("/personal");
  return { ok: true as const };
}
