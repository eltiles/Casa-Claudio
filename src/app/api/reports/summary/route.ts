import { NextResponse } from "next/server";
import { apiUser } from "@/lib/authz";
import { buildReportSummary } from "@/modules/accounting/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { user, status } = await apiUser(["ADMIN", "MANAGER", "ACCOUNTANT"]);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  const sp = new URL(req.url).searchParams;
  const now = new Date();
  const from = sp.get("from")
    ? new Date(`${sp.get("from")}T00:00:00`)
    : new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  const to = sp.get("to")
    ? new Date(`${sp.get("to")}T23:59:59.999`)
    : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const summary = await buildReportSummary(user.establishmentId, from, to);
  return NextResponse.json(summary);
}
