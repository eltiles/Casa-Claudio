import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { apiUser } from "@/lib/authz";
import { createSale } from "@/modules/sales/service";
import { FiscalError } from "@/lib/errors";
import type { PaymentMethod } from "@prisma/client";

export async function POST(req: NextRequest) {
  const { user, status } = await apiUser(["ADMIN", "MANAGER", "WAITER"]);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });

  try {
    const body = await req.json();
    const result = await createSale({
      establishmentId: user.establishmentId,
      idempotencyKey: String(body.idempotencyKey ?? crypto.randomUUID()),
      waiterId: user.id,
      tableId: body.tableId ? String(body.tableId) : null,
      lines: (body.lines ?? []).map((l: { productId: unknown; quantity: unknown }) => ({
        productId: String(l.productId),
        quantity: Number(l.quantity),
      })),
      payments: (body.payments ?? []).map(
        (p: { method: unknown; amount: unknown; reference?: unknown }) => ({
          method: String(p.method) as PaymentMethod,
          amount: Number(p.amount),
          reference: p.reference ? String(p.reference) : undefined,
        })
      ),
      actorId: user.id,
    });
    return NextResponse.json(
      { idempotent: result.idempotent, sale: result.sale },
      { status: result.idempotent ? 200 : 201 }
    );
  } catch (error) {
    if (error instanceof FiscalError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 422 });
    }
    console.error(error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
