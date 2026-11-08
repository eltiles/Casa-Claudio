import { NextRequest, NextResponse } from "next/server";
import { apiUser } from "@/lib/authz";
import { importBankCsv } from "@/modules/bank/service";
import { FiscalError } from "@/lib/errors";

export async function POST(req: NextRequest) {
  const { user, status } = await apiUser(["ADMIN", "MANAGER", "ACCOUNTANT"]);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  try {
    const body = await req.json();
    const result = await importBankCsv(
      user.establishmentId,
      String(body.accountId ?? ""),
      String(body.text ?? ""),
      user.id
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof FiscalError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 422 });
    }
    console.error(error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
