import { NextRequest, NextResponse } from "next/server";
import { apiUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { verifyTotp } from "@/lib/totp";

export async function POST(req: NextRequest) {
  const { user, status } = await apiUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  const body = await req.json();
  const me = await prisma.user.findUnique({ where: { id: user.id } });
  if (!me?.totpSecret) return NextResponse.json({ ok: false, error: "2FA no activado" }, { status: 422 });
  const ok = verifyTotp(me.totpSecret, String(body.code ?? ""));
  return NextResponse.json({ ok });
}
