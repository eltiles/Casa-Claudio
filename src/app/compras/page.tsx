import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ComprasPage() {
  const session = await auth();
  if (!session?.user?.establishmentId) redirect("/login");
  if (!["ADMIN", "MANAGER", "ACCOUNTANT"].includes(session.user.role)) redirect("/dashboard");
  const establishmentId = session.user.establishmentId;

  const purchases = await prisma.purchaseInvoice.findMany({
    where: { establishmentId },
    include: { supplier: true, lines: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <>
      <header className="topbar">
        <strong>Compras</strong>
        <Link href="/inventario">Inventario</Link>
        <Link href="/dashboard">Panel</Link>
      </header>
      <main>
        <h1>Facturas de proveedores</h1>
        <div className="card">
          <Link href="/compras/nueva">
            <button>Nueva compra</button>
          </Link>
        </div>
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Proveedor</th>
                <th>NIF</th>
                <th>Nº factura</th>
                <th>Fecha</th>
                <th>Base</th>
                <th>IVA</th>
                <th>Total</th>
                <th>Líneas</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id}>
                  <td>{p.supplier.name}</td>
                  <td className="mono">{p.supplier.nif ?? "—"}</td>
                  <td className="mono">{p.number}</td>
                  <td>{new Date(p.issueDate).toLocaleDateString("es-ES")}</td>
                  <td>{Number(p.totalBase).toFixed(2)} €</td>
                  <td>{Number(p.totalTax).toFixed(2)} €</td>
                  <td>{Number(p.total).toFixed(2)} €</td>
                  <td>{p.lines.length}</td>
                  <td><span className="badge ok">{p.status}</span></td>
                </tr>
              ))}
              {purchases.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ color: "#6b675c" }}>
                    Sin compras. Registra la primera desde «Nueva compra».
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
