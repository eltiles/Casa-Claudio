import { NextResponse } from "next/server";
import { apiUser } from "@/lib/authz";
import { clockOut } from "@/modules/hr/service";
import { FiscalError } from "@/lib/errors";

export async function POST() {
  const { user, status } = await apiUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  try {
    const r = await clockOut(user.establishmentId, user.id);
    return NextResponse.json(r);
  } catch (error) {
    if (error instanceof FiscalError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 422 });
    }
    console.error(error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
