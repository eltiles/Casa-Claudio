import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import NuevaVentaForm from "./nueva-venta-form";

export const dynamic = "force-dynamic";

export default async function NuevaVentaPage() {
  const session = await auth();
  if (!session?.user?.establishmentId) redirect("/login");

  const products = await prisma.product.findMany({
    where: { establishmentId: session.user.establishmentId, active: true },
    include: { taxRate: true },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <header className="topbar">
        <strong>Gestión Bar</strong>
        <Link href="/dashboard">Panel</Link>
        <Link href="/ventas/nueva">Nueva venta</Link>
      </header>
      <main style={{ maxWidth: 480 }}>
        <h1>Nueva venta</h1>
        <div className="card">
          <NuevaVentaForm
            products={products.map((p) => ({
              id: p.id,
              name: p.name,
              price: Number(p.price),
              taxPct: Number(p.taxRate.rate) * 100,
            }))}
          />
        </div>
      </main>
    </>
  );
}
