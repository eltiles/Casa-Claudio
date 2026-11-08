import { NextRequest, NextResponse } from "next/server";
import { apiUser } from "@/lib/authz";
import { closeCash } from "@/modules/cash/service";
import { FiscalError } from "@/lib/errors";

export async function POST(req: NextRequest) {
  const { user, status } = await apiUser(["ADMIN", "MANAGER", "ACCOUNTANT"]);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });

  try {
    const body = await req.json();
    const result = await closeCash({
      establishmentId: user.establishmentId,
      date: String(body.date ?? new Date().toISOString().slice(0, 10)),
      countedCash: Number(body.countedCash),
      openingFloat: Number(body.openingFloat ?? 0),
      closedById: user.id,
      notes: body.notes ? String(body.notes) : undefined,
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
