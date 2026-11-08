import { NextRequest, NextResponse } from "next/server";
import { apiUser } from "@/lib/authz";
import { saveRecipe } from "@/modules/inventory/service";
import { FiscalError } from "@/lib/errors";

export async function POST(req: NextRequest) {
  const { user, status } = await apiUser(["ADMIN", "MANAGER", "ACCOUNTANT"]);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });

  try {
    const body = await req.json();
    const result = await saveRecipe({
      establishmentId: user.establishmentId,
      productId: String(body.productId),
      lines: (body.lines ?? []).map((l: { stockItemId: unknown; quantity: unknown }) => ({
        stockItemId: String(l.stockItemId),
        quantity: Number(l.quantity),
      })),
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
