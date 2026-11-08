import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { commissionsReport } from "@/modules/hr/service";

export const dynamic = "force-dynamic";

export default async function ComisionesPage({
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
  const rows = await commissionsReport(session.user.establishmentId, from, to);
  const totalCommission = rows.reduce((s, r) => s + r.commission, 0);

  return (
    <>
      <header className="topbar">
        <strong>Comisiones</strong>
        <Link href="/dashboard">Panel</Link>
        <Link href="/personal">Personal</Link>
        <Link href="/turnos">Turnos</Link>
        <Link href="/informes">Informes</Link>
      </header>
      <main>
        <h1>Comisiones por camarero ({from.toISOString().slice(0, 10)} → {to.toISOString().slice(0, 10)})</h1>
        <p style={{ fontSize: 13, color: "#6b675c" }}>
          Comisión = % configurado por categoría (ver carta) aplicado sobre la base imponible de las líneas
          vendidas.{" "}
          <Link href={`/comisiones?from=${today}&to=${today}`}>Hoy</Link> ·{" "}
          <Link href={`/comisiones?from=${monthStart}&to=${today}`}>Este mes</Link>
        </p>
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Camarero</th>
                <th style={{ textAlign: "right" }}>Ventas</th>
                <th style={{ textAlign: "right" }}>Base vendida</th>
                <th style={{ textAlign: "right" }}>Total (IVA incl.)</th>
                <th style={{ textAlign: "right" }}>Comisión</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.waiterId}>
                  <td>{r.waiter}</td>
                  <td style={{ textAlign: "right" }}>{r.sales}</td>
                  <td style={{ textAlign: "right" }}>{r.base.toFixed(2)} €</td>
                  <td style={{ textAlign: "right" }}>{r.total.toFixed(2)} €</td>
                  <td style={{ textAlign: "right" }}><strong>{r.commission.toFixed(2)} €</strong></td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} style={{ color: "#6b675c" }}>Sin ventas asignadas a camarero en el período.</td></tr>
              )}
              {rows.length > 0 && (
                <tr>
                  <td><strong>Total</strong></td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td style={{ textAlign: "right" }}><strong>{totalCommission.toFixed(2)} €</strong></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
