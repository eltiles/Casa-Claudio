import { NextResponse } from "next/server";
import { apiUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { buildTicketEscPos } from "@/lib/escpos";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { user, status } = await apiUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status });
  const invoiceId = new URL(req.url).searchParams.get("invoiceId");
  if (!invoiceId) return NextResponse.json({ error: "invoiceId requerido" }, { status: 422 });
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, establishmentId: user.establishmentId },
    include: { lines: true, establishment: true },
  });
  if (!invoice) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const buffer = buildTicketEscPos({
    establishmentName: invoice.establishment.name,
    nif: invoice.establishment.nif,
    address: `${invoice.establishment.address}, ${invoice.establishment.postalCode} ${invoice.establishment.municipality}`,
    series: invoice.seriesCode,
    number: invoice.number,
    date: invoice.issueDate.toLocaleString("es-ES"),
    lines: invoice.lines.map((l) => ({
      description: l.description,
      quantity: Number(l.quantity),
      total: `${Number(l.totalAmount).toFixed(2)} EUR`,
    })),
    base: `${Number(invoice.totalBase).toFixed(2)} EUR`,
    tax: `${Number(invoice.totalTax).toFixed(2)} EUR`,
    total: `${Number(invoice.total).toFixed(2)} EUR`,
    hash: invoice.hash,
  });

  const agentUrl = process.env.PRINT_AGENT_URL;
  if (agentUrl) {
    const res = await fetch(`${agentUrl}/print`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: new Uint8Array(buffer),
    });
    return NextResponse.json({ sentToAgent: res.ok, status: res.status });
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="ticket-${invoice.seriesCode}-${invoice.number}.bin"`,
    },
  });
}
