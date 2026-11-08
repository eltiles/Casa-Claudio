import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { buildReportSummary } from "@/modules/accounting/service";

export const dynamic = "force-dynamic";

export default async function InformesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.establishmentId) redirect("/login");
  if (!["ADMIN", "MANAGER", "ACCOUNTANT"].includes(session.user.role)) redirect("/dashboard");
  const sp = await searchParams;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const from = sp.from ? new Date(`${sp.from}T00:00:00`) : new Date(`${monthStart}T00:00:00`);
  const to = sp.to ? new Date(`${sp.to}T23:59:59.999`) : new Date();
  const r = await buildReportSummary(session.user.establishmentId, from, to);

  const methodLabel: Record<string, string> = {
    CASH: "Efectivo",
    CARD: "Tarjeta",
    CONTACTLESS: "Contactless",
    BIZUM: "Bizum",
    OTHER: "Otro",
  };

  return (
    <>
      <header className="topbar">
        <strong>Informes</strong>
        <Link href="/dashboard">Panel</Link>
        <Link href="/contabilidad">Contabilidad</Link>
        <Link href="/banca">Banca</Link>
      </header>
      <main>
        <h1>Informes ({r.from} → {r.to})</h1>
        <p style={{ fontSize: 13, color: "#6b675c" }}>
          <Link href={`/informes?from=${today}&to=${today}`}>Hoy</Link> ·{" "}
          <Link href={`/informes?from=${monthStart}&to=${today}`}>Este mes</Link> ·{" "}
          <Link href="/informes">Mes en curso</Link>
        </p>
        <div className="grid2">
          <div className="card">
            <h2>Cuenta de pérdidas y ganancias</h2>
            <table>
              <tbody>
                <tr><td>Ingresos (ventas)</td><td style={{ textAlign: "right" }}>{r.ingresos.toFixed(2)} €</td></tr>
                <tr><td>Compras (600)</td><td style={{ textAlign: "right" }}>−{r.compras.toFixed(2)} €</td></tr>
                <tr><td>Otros gastos</td><td style={{ textAlign: "right" }}>−{(r.gastos - r.compras).toFixed(2)} €</td></tr>
                <tr>
                  <td><strong>Beneficio</strong></td>
                  <td style={{ textAlign: "right" }}><strong>{r.beneficio.toFixed(2)} €</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="card">
            <h2>IVA del período</h2>
            <table>
              <tbody>
                <tr><td>IVA repercutido (477)</td><td style={{ textAlign: "right" }}>{r.ivaRepercutido.toFixed(2)} €</td></tr>
                <tr><td>IVA soportado (472)</td><td style={{ textAlign: "right" }}>−{r.ivaSoportado.toFixed(2)} €</td></tr>
                <tr>
                  <td><strong>Resultado IVA</strong></td>
                  <td style={{ textAlign: "right" }}><strong>{r.ivaResultado.toFixed(2)} €</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="card">
            <h2>Flujo de caja (cash flow)</h2>
            <table>
              <tbody>
                <tr><td>Cobros TPV</td><td style={{ textAlign: "right" }}>{r.totalCobros.toFixed(2)} €</td></tr>
                <tr><td>Pagos a proveedores</td><td style={{ textAlign: "right" }}>−{r.pagosProveedores.toFixed(2)} €</td></tr>
                <tr>
                  <td><strong>Cash flow neto</strong></td>
                  <td style={{ textAlign: "right" }}><strong>{r.cashFlow.toFixed(2)} €</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="card">
            <h2>Cobros por método de pago</h2>
            <table>
              <tbody>
                {Object.entries(r.cobrosPorMetodo).map(([m, v]) => (
                  <tr key={m}>
                    <td>{methodLabel[m] ?? m}</td>
                    <td style={{ textAlign: "right" }}>{v.toFixed(2)} €</td>
                  </tr>
                ))}
                {Object.keys(r.cobrosPorMetodo).length === 0 && (
                  <tr><td style={{ color: "#6b675c" }}>Sin cobros en el período</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid2">
          <div className="card">
            <h2>Ventas por día</h2>
            <table>
              <thead>
                <tr><th>Día</th><th style={{ textAlign: "right" }}>Ventas</th><th style={{ textAlign: "right" }}>Cobros</th></tr>
              </thead>
              <tbody>
                {r.porDia.map((d) => (
                  <tr key={d.dia}>
                    <td>{d.dia}</td>
                    <td style={{ textAlign: "right" }}>{d.ventas.toFixed(2)} €</td>
                    <td style={{ textAlign: "right" }}>{d.cobros.toFixed(2)} €</td>
                  </tr>
                ))}
                {r.porDia.length === 0 && (
                  <tr><td colSpan={3} style={{ color: "#6b675c" }}>Sin ventas en el período</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h2>Cierres de caja</h2>
            <table>
              <thead>
                <tr><th>Día</th><th>Estado</th><th style={{ textAlign: "right" }}>Descuadre</th></tr>
              </thead>
              <tbody>
                {r.cierres.map((c) => (
                  <tr key={c.date}>
                    <td>{c.date}</td>
                    <td>{c.status}</td>
                    <td style={{ textAlign: "right" }}>
                      {c.difference === null ? "—" : `${c.difference.toFixed(2)} €`}
                    </td>
                  </tr>
                ))}
                {r.cierres.length === 0 && (
                  <tr><td colSpan={3} style={{ color: "#6b675c" }}>Sin cierres en el período</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </>
  );
}
