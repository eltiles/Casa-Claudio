import { NextRequest, NextResponse } from "next/server";
import { apiUser } from "@/lib/authz";
import { createPurchaseInvoice, type PurchaseLineInput } from "@/modules/inventory/service";
import { FiscalError } from "@/lib/errors";

export async function POST(req: NextRequest) {
  const { user, status } = await apiUser(["ADMIN", "MANAGER", "ACCOUNTANT"]);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });

  try {
    const body = await req.json();
    const invoice = await createPurchaseInvoice({
      establishmentId: user.establishmentId,
      supplierId: String(body.supplierId),
      number: String(body.number ?? ""),
      issueDate: String(body.issueDate ?? ""),
      lines: (body.lines ?? []).map(
        (l: {
          stockItemId: unknown;
          description?: unknown;
          quantity: unknown;
          unitCost: unknown;
          taxRatePct: unknown;
        }): PurchaseLineInput => ({
          stockItemId: String(l.stockItemId),
          description: l.description ? String(l.description) : "",
          quantity: Number(l.quantity),
          unitCost: Number(l.unitCost),
          taxRatePct: Number(l.taxRatePct),
        })
      ),
      actorId: user.id,
    });
    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    if (error instanceof FiscalError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 422 });
    }
    console.error(error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
