import { NextRequest, NextResponse } from "next/server";
import { apiUser } from "@/lib/authz";
import { createUser, listUsers } from "@/modules/hr/service";
import { FiscalError } from "@/lib/errors";
import type { Role } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user, status } = await apiUser(["ADMIN", "MANAGER", "ACCOUNTANT"]);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  const users = await listUsers(user.establishmentId);
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const { user, status } = await apiUser(["ADMIN", "MANAGER"]);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  try {
    const body = await req.json();
    const result = await createUser({
      establishmentId: user.establishmentId,
      name: String(body.name ?? ""),
      email: String(body.email ?? ""),
      password: String(body.password ?? ""),
      role: String(body.role ?? "WAITER") as Role,
      pin: body.pin ? String(body.pin) : undefined,
      actorId: user.id,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof FiscalError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 422 });
    }
    console.error(error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
