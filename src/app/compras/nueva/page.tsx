import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import CompraForm from "./compra-form";

export const dynamic = "force-dynamic";

export default async function NuevaCompraPage() {
  const session = await auth();
  if (!session?.user?.establishmentId) redirect("/login");
  if (!["ADMIN", "MANAGER", "ACCOUNTANT"].includes(session.user.role)) redirect("/dashboard");
  const establishmentId = session.user.establishmentId;

  const [suppliers, stockItems, taxRates] = await Promise.all([
    prisma.supplier.findMany({ where: { establishmentId }, orderBy: { name: "asc" } }),
    prisma.stockItem.findMany({ where: { establishmentId, active: true }, orderBy: { name: "asc" } }),
    prisma.taxRate.findMany({ where: { active: true }, orderBy: { rate: "desc" } }),
  ]);

  return (
    <>
      <header className="topbar">
        <strong>Nueva compra</strong>
        <Link href="/compras">Compras</Link>
        <Link href="/inventario">Inventario</Link>
      </header>
      <main style={{ maxWidth: 900 }}>
        <h1>Registrar compra a proveedor</h1>
        <div className="card">
          <CompraForm
            suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, nif: s.nif }))}
            stockItems={stockItems.map((s) => ({
              id: s.id,
              name: s.name,
              unit: s.unit,
              unitCost: Number(s.unitCost),
            }))}
            taxRates={taxRates.map((t) => ({ id: t.id, label: t.label, rate: Number(t.rate) }))}
          />
        </div>
      </main>
    </>
  );
}
