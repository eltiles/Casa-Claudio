import { NextResponse } from "next/server";
import { apiUser } from "@/lib/authz";
import { listBankMovements } from "@/modules/bank/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { user, status } = await apiUser(["ADMIN", "MANAGER", "ACCOUNTANT"]);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? 200);
  const movements = await listBankMovements(user.establishmentId, limit);
  return NextResponse.json({ movements });
}
