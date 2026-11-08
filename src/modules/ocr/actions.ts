"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { FiscalError } from "@/lib/errors";
import {
  approveOcrDraft,
  parseInvoiceText,
  saveOcrDraft,
  type ParsedInvoice,
} from "@/modules/ocr/service";

const ROLES = ["ADMIN", "MANAGER", "ACCOUNTANT"];

async function ocrUser() {
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

export async function parseInvoiceAction(text: string) {
  const u = await ocrUser();
  if (!u) return { ok: false as const, error: "UNAUTHORIZED", message: "Sin sesión o sin permiso" };
  if (text.length < 20) return { ok: false as const, error: "TEXT_TOO_SHORT", message: "Texto demasiado corto" };
  return { ok: true as const, parsed: parseInvoiceText(text) };
}

export async function saveOcrDraftAction(input: { parsed: ParsedInvoice; rawText: string }) {
  const u = await ocrUser();
  if (!u) return { ok: false as const, error: "UNAUTHORIZED", message: "Sin sesión o sin permiso" };
  try {
    const invoice = await saveOcrDraft({
      establishmentId: u.establishmentId,
      parsed: input.parsed,
      rawText: input.rawText,
      actorId: u.id,
    });
    revalidatePath("/ocr");
    revalidatePath("/compras");
    return { ok: true as const, id: invoice.id, number: invoice.number, total: Number(invoice.total) };
  } catch (e) {
    return toError(e);
  }
}

export async function approveOcrDraftAction(input: { id: string }) {
  const u = await ocrUser();
  if (!u) return { ok: false as const, error: "UNAUTHORIZED", message: "Sin sesión o sin permiso" };
  try {
    const r = await approveOcrDraft({ id: input.id, actorId: u.id });
    revalidatePath("/ocr");
    revalidatePath("/inventario");
    revalidatePath("/contabilidad");
    return { ok: true as const, ...r };
  } catch (e) {
    return toError(e);
  }
}
