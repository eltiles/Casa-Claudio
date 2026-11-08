import { NextRequest, NextResponse } from "next/server";
import { apiUser } from "@/lib/authz";
import { issueDocument } from "@/modules/fiscal/service";
import { prisma } from "@/lib/db";
import { FiscalError } from "@/lib/errors";
import type { InvoiceKind } from "@prisma/client";

export async function GET(req: NextRequest) {
  const { user, status } = await apiUser(["ADMIN", "MANAGER", "ACCOUNTANT"]);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? 50);
  const invoices = await prisma.invoice.findMany({
    where: { establishmentId: user.establishmentId },
    orderBy: [{ createdAt: "desc" }],
    take: Math.min(limit, 200),
    include: { lines: true },
  });
  return NextResponse.json({ invoices });
}

export async function POST(req: NextRequest) {
  const { user, status } = await apiUser(["ADMIN", "MANAGER", "ACCOUNTANT"]);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });

  try {
    const body = await req.json();
    const invoice = await issueDocument({
      establishmentId: user.establishmentId,
      kind: String(body.kind ?? "SIMPLIFIED") as InvoiceKind,
      seriesCode: body.seriesCode ? String(body.seriesCode) : undefined,
      customerNif: body.customerNif ? String(body.customerNif) : undefined,
      customerName: body.customerName ? String(body.customerName) : undefined,
      rectifiesId: body.rectifiesId ? String(body.rectifiesId) : undefined,
      lines: (body.lines ?? []).map(
        (l: {
          productId?: unknown;
          description: unknown;
          quantity: unknown;
          unitPrice: unknown;
          taxRateId: unknown;
        }) => ({
          productId: l.productId ? String(l.productId) : undefined,
          description: String(l.description),
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
          taxRateId: String(l.taxRateId),
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
