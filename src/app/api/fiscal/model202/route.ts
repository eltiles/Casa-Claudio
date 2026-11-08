import { NextResponse } from "next/server";
import { apiUser } from "@/lib/authz";
import { modelo202 } from "@/modules/fiscal/models";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { user, status } = await apiUser(["ADMIN", "MANAGER", "ACCOUNTANT"]);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  const year = Number(new URL(req.url).searchParams.get("year") ?? new Date().getFullYear());
  return NextResponse.json(await modelo202(user.establishmentId, year));
}
