import { NextResponse } from "next/server";
import { apiUser } from "@/lib/authz";
import { verifyChain } from "@/modules/fiscal/service";

export async function GET() {
  const { user, status } = await apiUser(["ADMIN", "MANAGER", "ACCOUNTANT"]);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  const result = await verifyChain(user.establishmentId);
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
