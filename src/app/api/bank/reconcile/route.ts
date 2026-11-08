import { NextResponse } from "next/server";
import { apiUser } from "@/lib/authz";
import { reconcileBank } from "@/modules/bank/service";

export async function POST() {
  const { user, status } = await apiUser(["ADMIN", "MANAGER", "ACCOUNTANT"]);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  const result = await reconcileBank(user.establishmentId);
  return NextResponse.json(result);
}
