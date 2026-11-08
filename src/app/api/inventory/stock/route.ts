import { NextResponse } from "next/server";
import { apiUser } from "@/lib/authz";
import { listLowStock, listStock } from "@/modules/inventory/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { user, status } = await apiUser(["ADMIN", "MANAGER", "ACCOUNTANT", "WAITER"]);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  const lowOnly = new URL(req.url).searchParams.get("low") === "1";
  const items = lowOnly ? await listLowStock(user.establishmentId) : await listStock(user.establishmentId);
  return NextResponse.json({ items });
}
