import { NextRequest, NextResponse } from "next/server";
import { apiUser } from "@/lib/authz";
import { listOcrDrafts, saveOcrDraft, type ParsedInvoice } from "@/modules/ocr/service";
import { FiscalError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user, status } = await apiUser(["ADMIN", "MANAGER", "ACCOUNTANT"]);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  const drafts = await listOcrDrafts(user.establishmentId);
  return NextResponse.json({ drafts });
}

export async function POST(req: NextRequest) {
  const { user, status } = await apiUser(["ADMIN", "MANAGER", "ACCOUNTANT"]);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  try {
    const body = await req.json();
    const invoice = await saveOcrDraft({
      establishmentId: user.establishmentId,
      parsed: body.parsed as ParsedInvoice,
      rawText: String(body.rawText ?? ""),
      actorId: user.id,
    });
    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    if (error instanceof FiscalError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 422 });
    }
    console.error(error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
