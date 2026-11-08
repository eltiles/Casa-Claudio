import { NextRequest, NextResponse } from "next/server";
import { apiUser } from "@/lib/authz";
import { listSupplierPayments, paySupplier } from "@/modules/bank/service";
import { FiscalError } from "@/lib/errors";
import type { PaymentMethod } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user, status } = await apiUser(["ADMIN", "MANAGER", "ACCOUNTANT"]);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  const payments = await listSupplierPayments(user.establishmentId);
  return NextResponse.json({ payments });
}

export async function POST(req: NextRequest) {
  const { user, status } = await apiUser(["ADMIN", "MANAGER", "ACCOUNTANT"]);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  try {
    const body = await req.json();
    const payment = await paySupplier({
      establishmentId: user.establishmentId,
      supplierId: String(body.supplierId ?? ""),
      purchaseInvoiceId: body.purchaseInvoiceId ? String(body.purchaseInvoiceId) : null,
      amount: Number(body.amount),
      method: String(body.method ?? "CARD") as PaymentMethod,
      paidAt: String(body.paidAt ?? new Date().toISOString().slice(0, 10)),
      reference: body.reference ? String(body.reference) : undefined,
      actorId: user.id,
    });
    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) {
    if (error instanceof FiscalError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 422 });
    }
    console.error(error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
