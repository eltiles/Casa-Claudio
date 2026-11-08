import { NextResponse } from "next/server";
import { apiUser } from "@/lib/authz";
import { modelo130 } from "@/modules/fiscal/models";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { user, status } = await apiUser(["ADMIN", "MANAGER", "ACCOUNTANT"]);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  const sp = new URL(req.url).searchParams;
  const year = Number(sp.get("year") ?? new Date().getFullYear());
  const quarter = Math.min(4, Math.max(1, Number(sp.get("quarter") ?? Math.ceil((new Date().getMonth() + 1) / 3))));
  return NextResponse.json(await modelo130(user.establishmentId, year, quarter));
}
