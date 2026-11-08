import { NextResponse } from "next/server";
import { apiUser } from "@/lib/authz";
import { disableTotp, enableTotp } from "@/modules/hr/service";

export const dynamic = "force-dynamic";

export async function POST() {
  const { user, status } = await apiUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  const result = await enableTotp(user.id);
  return NextResponse.json(result, { status: 201 });
}

export async function DELETE() {
  const { user, status } = await apiUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  await disableTotp(user.id);
  return NextResponse.json({ ok: true });
}
