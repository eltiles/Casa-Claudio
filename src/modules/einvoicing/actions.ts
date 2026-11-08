"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { sendPending } from "@/modules/einvoicing/service";

export async function sendVerifactuAction() {
  const session = await auth();
  if (!session?.user?.id || !session.user.establishmentId)
    return { ok: false as const, error: "UNAUTHORIZED", message: "Sin sesión" };
  if (!["ADMIN", "ACCOUNTANT"].includes(session.user.role))
    return { ok: false as const, error: "FORBIDDEN", message: "Solo ADMIN/ACCOUNTANT" };
  const result = await sendPending(session.user.establishmentId);
  revalidatePath("/fiscal");
  revalidatePath("/dashboard");
  return { ok: true as const, ...result };
}
