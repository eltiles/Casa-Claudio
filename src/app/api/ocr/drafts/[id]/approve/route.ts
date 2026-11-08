import { NextRequest, NextResponse } from "next/server";
import { apiUser } from "@/lib/authz";
import { approveOcrDraft } from "@/modules/ocr/service";
import { FiscalError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, status } = await apiUser(["ADMIN", "MANAGER", "ACCOUNTANT"]);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  try {
    const { id } = await params;
    const result = await approveOcrDraft({ id, actorId: user.id });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof FiscalError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 422 });
    }
    console.error(error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
