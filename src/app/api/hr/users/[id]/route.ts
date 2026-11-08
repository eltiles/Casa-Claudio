import { NextRequest, NextResponse } from "next/server";
import { apiUser } from "@/lib/authz";
import { updateUser } from "@/modules/hr/service";
import { FiscalError } from "@/lib/errors";
import type { Role } from "@prisma/client";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, status } = await apiUser(["ADMIN", "MANAGER"]);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  try {
    const { id } = await params;
    const body = await req.json();
    const result = await updateUser({
      establishmentId: user.establishmentId,
      id,
      role: body.role ? (String(body.role) as Role) : undefined,
      active: body.active !== undefined ? Boolean(body.active) : undefined,
      pin: body.pin ? String(body.pin) : undefined,
      actorId: user.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof FiscalError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 422 });
    }
    console.error(error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
