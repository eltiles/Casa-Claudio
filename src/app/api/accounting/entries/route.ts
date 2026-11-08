import { NextResponse } from "next/server";
import { apiUser } from "@/lib/authz";
import { listLedgerEntries } from "@/modules/accounting/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { user, status } = await apiUser(["ADMIN", "MANAGER", "ACCOUNTANT"]);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  const sp = new URL(req.url).searchParams;
  const from = sp.get("from") ? new Date(`${sp.get("from")}T00:00:00`) : undefined;
  const to = sp.get("to") ? new Date(`${sp.get("to")}T23:59:59.999`) : undefined;
  const limit = Number(sp.get("limit") ?? 100);
  const entries = await listLedgerEntries(user.establishmentId, from, to, limit);
  return NextResponse.json({ entries });
}
