import { NextRequest, NextResponse } from "next/server";
import { apiUser } from "@/lib/authz";
import { clockIn, listShifts } from "@/modules/hr/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { user, status } = await apiUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  const date = new URL(req.url).searchParams.get("date") ?? undefined;
  const shifts = await listShifts(user.establishmentId, date ?? undefined);
  return NextResponse.json({ shifts });
}

export async function POST(req: NextRequest) {
  const { user, status } = await apiUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  const r = await clockIn(user.establishmentId, user.id);
  return NextResponse.json(r, { status: r.alreadyOpen ? 200 : 201 });
}
