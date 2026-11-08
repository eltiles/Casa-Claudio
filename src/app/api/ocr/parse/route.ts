import { NextRequest, NextResponse } from "next/server";
import { apiUser } from "@/lib/authz";
import { parseInvoiceText } from "@/modules/ocr/service";

export async function POST(req: NextRequest) {
  const { user, status } = await apiUser(["ADMIN", "MANAGER", "ACCOUNTANT"]);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  const body = await req.json();
  const text = String(body.text ?? "");
  if (text.length < 20) return NextResponse.json({ error: "TEXT_TOO_SHORT" }, { status: 422 });
  return NextResponse.json({ parsed: parseInvoiceText(text) });
}
