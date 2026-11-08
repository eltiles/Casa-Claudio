import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { listLowStock, listMovements, listStock } from "@/modules/inventory/service";
import DrainButton from "./drain-button";

export const dynamic = "force-dynamic";

export default async function InventarioPage() {
  const session = await auth();
  if (!session?.user?.establishmentId) redirect("/login");
  const establishmentId = session.user.establishmentId;

  const [stock, lowStock, movements, purchases] = await Promise.all([
    listStock(establishmentId),
    listLowStock(establishmentId),
    listMovements(establishmentId, 30),
    prisma.purchaseInvoice.findMany({
      where: { establishmentId },
      include: { supplier: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  return (
    <>
      <header className="topbar">
        <strong>Inventario</strong>
        <Link href="/dashboard">Panel</Link>
        <Link href="/tpv">TPV</Link>
        <Link href="/carta">Carta</Link>
        <Link href="/compras">Compras</Link>
      </header>
      <main>
        <h1>Stock</h1>
        {lowStock.length > 0 && (
          <div className="alert error">
            <strong>Stock bajo:</strong> {lowStock.map((i) => `${i.name} (${i.quantity} ${i.unit} / mín ${i.minStock})`).join(", ")}
          </div>
        )}
        <div className="card">
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>Artículos</h2>
            <Link href="/compras/nueva" style={{ marginLeft: "auto" }}>
              <button>Nueva compra</button>
            </Link>
            <DrainButton />
          </div>
          <table>
            <thead>
              <tr>
                <th>Artículo</th>
                <th>SKU</th>
                <th>Cantidad</th>
                <th>Mínimo</th>
                <th>Coste últ.</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {stock.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td className="mono">{s.sku}</td>
                  <td>
                    {s.quantity} {s.unit}
                  </td>
                  <td>
                    {s.minStock} {s.unit}
                  </td>
                  <td>{s.unitCost.toFixed(4)} €</td>
                  <td>{s.low ? <span className="badge bad">BAJO</span> : <span className="badge ok">OK</span>}</td>
                </tr>
              ))}
              {stock.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ color: "#6b675c" }}>
                    Sin artículos. Añade compras o edita el seed.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="grid2">
          <div className="card">
            <h2>Últimos movimientos (kardex)</h2>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Artículo</th>
                  <th>Tipo</th>
                  <th>Cantidad</th>
                  <th>Ref.</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td>{new Date(m.createdAt).toLocaleString("es-ES")}</td>
                    <td>{m.stockItem.name}</td>
                    <td>{m.type === "IN" ? "entrada" : m.type === "OUT" ? "salida" : "ajuste"}</td>
                    <td>
                      {m.type === "OUT" ? "−" : "+"}
                      {m.quantity} {m.stockItem.unit}
                    </td>
                    <td className="mono">{m.reference ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h2>Últimas compras</h2>
            <table>
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th>Nº</th>
                  <th>Fecha</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id}>
                    <td>{p.supplier.name}</td>
                    <td className="mono">{p.number}</td>
                    <td>{new Date(p.issueDate).toLocaleDateString("es-ES")}</td>
                    <td>{Number(p.total).toFixed(2)} €</td>
                  </tr>
                ))}
                {purchases.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ color: "#6b675c" }}>
                      Sin compras registradas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </>
  );
}
