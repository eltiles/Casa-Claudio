import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { verifyChain } from "@/modules/fiscal/service";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.establishmentId) redirect("/login");
  const establishmentId = session.user.establishmentId;
  const userName = session.user.name ?? session.user.email ?? "";

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const [invoices, chain, salesToday, openClosing] = await Promise.all([
    prisma.invoice.findMany({
      where: { establishmentId },
      orderBy: [{ createdAt: "desc" }],
      take: 10,
      include: { lines: true },
    }),
    verifyChain(establishmentId),
    prisma.sale.aggregate({
      where: { establishmentId, status: "PAID", createdAt: { gte: dayStart } },
      _sum: { total: true },
      _count: true,
    }),
    prisma.cashClosing.findFirst({
      where: { establishmentId, date: dayStart, status: "OPEN" },
    }),
  ]);

  return (
    <>
      <header className="topbar">
        <strong>Gestión Bar</strong>
        <Link href="/dashboard">Panel</Link>
        <Link href="/tpv">TPV</Link>
        <Link href="/mesas">Mesas</Link>
        <Link href="/kds">Cocina</Link>
        <Link href="/ventas/nueva">Venta rápida</Link>
        <span style={{ marginLeft: "auto", fontSize: 13 }}>{userName}</span>
      </header>
      <main>
        <h1>Panel</h1>

        <div className="grid2">
          <div className="card">
            <h2>Ventas de hoy</h2>
            <p style={{ fontSize: 28, margin: 0 }}>
              {(Number(salesToday._sum.total ?? 0)).toFixed(2)} €
            </p>
            <p style={{ color: "#6b675c", margin: "4px 0 0" }}>{salesToday._count} ventas cobradas</p>
          </div>
          <div className="card">
            <h2>Integridad de la cadena de facturación</h2>
            <p>
              {chain.ok ? (
                <span className="badge ok">OK — {chain.count} documentos verificados</span>
              ) : (
                <span className="badge bad">RUPTURA detectada en {chain.firstBadInvoiceId}</span>
              )}
            </p>
            <p style={{ color: "#6b675c", fontSize: 13 }}>
              Cada documento encadena el hash SHA-256 del anterior (RD 1007/2023). Estado de caja del día:{" "}
              {openClosing ? "abierta" : "sin cierre abierto"}
            </p>
          </div>
        </div>

        <div className="card">
          <h2>Últimos documentos emitidos</h2>
          <table>
            <thead>
              <tr>
                <th>Serie</th>
                <th>Número</th>
                <th>Tipo</th>
                <th>Cliente</th>
                <th>Base</th>
                <th>IVA</th>
                <th>Total</th>
                <th>Hash</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.seriesCode}</td>
                  <td>{inv.number}</td>
                  <td>{inv.kind}</td>
                  <td>{inv.customerNif ?? "—"}</td>
                  <td>{Number(inv.totalBase).toFixed(2)} €</td>
                  <td>{Number(inv.totalTax).toFixed(2)} €</td>
                  <td>{Number(inv.total).toFixed(2)} €</td>
                  <td className="mono">{inv.hash.slice(0, 16)}…</td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ color: "#6b675c" }}>
                    Aún no hay documentos. Crea una venta desde «Nueva venta».
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
