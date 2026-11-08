import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import TpvClient from "./tpv-client";

export const dynamic = "force-dynamic";

export default async function TpvPage({
  searchParams,
}: {
  searchParams: Promise<{ venta?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.establishmentId) redirect("/login");
  if (!["ADMIN", "MANAGER", "WAITER"].includes(session.user.role)) redirect("/dashboard");
  const sp = await searchParams;
  const establishmentId = session.user.establishmentId;

  const [categories, products, tables, sale] = await Promise.all([
    prisma.category.findMany({ where: { establishmentId }, orderBy: { name: "asc" } }),
    prisma.product.findMany({
      where: { establishmentId, active: true },
      include: { taxRate: true },
      orderBy: { name: "asc" },
    }),
    prisma.diningTable.findMany({
      where: { establishmentId },
      include: {
        sales: { where: { status: "OPEN" }, include: { waiter: true } },
      },
      orderBy: { name: "asc" },
    }),
    sp.venta
      ? prisma.sale.findFirst({
          where: { id: sp.venta, establishmentId },
          include: { lines: true, waiter: true },
        })
      : null,
  ]);

  if (sp.venta && !sale) redirect("/tpv");

  return (
    <TpvClient
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      products={products.map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        taxPct: Number(p.taxRate.rate) * 100,
        categoryId: p.categoryId,
      }))}
      tables={tables.map((t) => ({
        id: t.id,
        name: t.name,
        status: t.status,
        openSale: t.sales[0]
          ? {
              id: t.sales[0].id,
              number: t.sales[0].number,
              total: Number(t.sales[0].total),
              waiter: t.sales[0].waiter?.name ?? "",
            }
          : null,
      }))}
      initialSale={
        sale
          ? {
              id: sale.id,
              number: sale.number,
              tableId: sale.tableId,
              waiter: sale.waiter?.name ?? "",
              lines: sale.lines.map((l) => ({
                id: l.id,
                productId: l.productId,
                description: l.description,
                quantity: Number(l.quantity),
                unitPrice: Number(l.unitPrice),
                taxPct: Number(l.taxRatePct) * 100,
                total: Number(l.totalAmount),
              })),
            }
          : null
      }
    />
  );
}
