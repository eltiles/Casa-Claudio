import { NextRequest, NextResponse } from "next/server";
import { apiUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { ensureBankAccount } from "@/modules/bank/service";
import { FiscalError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user, status } = await apiUser(["ADMIN", "MANAGER", "ACCOUNTANT"]);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  const accounts = await prisma.bankAccount.findMany({
    where: { establishmentId: user.establishmentId },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, bankName: a.bankName, iban: a.iban })),
  });
}

export async function POST(req: NextRequest) {
  const { user, status } = await apiUser(["ADMIN", "MANAGER", "ACCOUNTANT"]);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  try {
    const body = await req.json();
    const account = await ensureBankAccount(user.establishmentId, {
      name: String(body.name ?? ""),
      bankName: body.bankName ? String(body.bankName) : undefined,
      iban: body.iban ? String(body.iban).replace(/\s/g, "").toUpperCase() : undefined,
    });
    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    if (error instanceof FiscalError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 422 });
    }
    console.error(error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
