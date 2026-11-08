import { NextResponse } from "next/server";
import { apiUser } from "@/lib/authz";
import { einvoicingStatus } from "@/modules/einvoicing/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user, status } = await apiUser(["ADMIN", "ACCOUNTANT"]);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  return NextResponse.json(await einvoicingStatus(user.establishmentId));
}
