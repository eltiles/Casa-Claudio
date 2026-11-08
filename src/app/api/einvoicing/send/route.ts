import { NextResponse } from "next/server";
import { apiUser } from "@/lib/authz";
import { sendPending } from "@/modules/einvoicing/service";

export const dynamic = "force-dynamic";

export async function POST() {
  const { user, status } = await apiUser(["ADMIN", "ACCOUNTANT"]);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  const result = await sendPending(user.establishmentId);
  return NextResponse.json(result);
}
