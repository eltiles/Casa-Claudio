import { NextResponse } from "next/server";
import { apiUser } from "@/lib/authz";
import { listMovements } from "@/modules/inventory/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { user, status } = await apiUser(["ADMIN", "MANAGER", "ACCOUNTANT", "WAITER"]);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? 100);
  const movements = await listMovements(user.establishmentId, Math.min(limit, 500));
  return NextResponse.json({ movements });
}
