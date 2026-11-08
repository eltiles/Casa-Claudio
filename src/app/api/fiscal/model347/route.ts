import { NextResponse } from "next/server";
import { apiUser } from "@/lib/authz";
import { modelo347 } from "@/modules/fiscal/models";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { user, status } = await apiUser(["ADMIN", "MANAGER", "ACCOUNTANT"]);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  const year = Number(new URL(req.url).searchParams.get("year") ?? new Date().getFullYear());
  const result = await modelo347(user.establishmentId, year);
  return NextResponse.json(result);
}
