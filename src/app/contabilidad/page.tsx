import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { listLedgerEntries } from "@/modules/accounting/service";

export const dynamic = "force-dynamic";

export default async function ContabilidadPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.establishmentId) redirect("/login");
  if (!["ADMIN", "MANAGER", "ACCOUNTANT"].includes(session.user.role)) redirect("/dashboard");
  const sp = await searchParams;
  const from = sp.from ? new Date(`${sp.from}T00:00:00`) : undefined;
  const to = sp.to ? new Date(`${sp.to}T23:59:59.999`) : undefined;
  const entries = await listLedgerEntries(session.user.establishmentId, from, to, 200);
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date().toISOString().slice(0, 8) + "01";

  return (
    <>
      <header className="topbar">
        <strong>Contabilidad</strong>
        <Link href="/dashboard">Panel</Link>
        <Link href="/informes">Informes</Link>
        <Link href="/fiscal">Modelos</Link>
        <Link href="/banca">Banca</Link>
      </header>
      <main>
        <h1>Libro diario</h1>
        <p style={{ fontSize: 13, color: "#6b675c" }}>
          Filtros:{" "}
          <Link href="/contabilidad">Todo</Link> ·{" "}
          <Link href={`/contabilidad?from=${today}&to=${today}`}>Hoy</Link> ·{" "}
          <Link href={`/contabilidad?from=${monthStart}&to=${today}`}>Este mes</Link>
        </p>
        {entries.map((e) => (
          <div key={e.id} className="card">
            <p style={{ margin: "0 0 8px" }}>
              <strong>
                Asiento nº {e.number}
              </strong>{" "}
              — {e.date} — {e.description} —{" "}
              <span className="mono" style={{ fontSize: 12 }}>
                {e.source}
              </span>{" "}
              {e.balanced ? <span className="badge ok">cuadrado</span> : <span className="badge bad">DESCuadrado</span>}
            </p>
            <table>
              <thead>
                <tr>
                  <th>Cuenta</th>
                  <th>Nombre</th>
                  <th style={{ textAlign: "right" }}>Debe</th>
                  <th style={{ textAlign: "right" }}>Haber</th>
                  <th>Concepto</th>
                </tr>
              </thead>
              <tbody>
                {e.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="mono">{l.account}</td>
                    <td>{l.name}</td>
                    <td style={{ textAlign: "right" }}>{l.debit > 0 ? `${l.debit.toFixed(2)} €` : ""}</td>
                    <td style={{ textAlign: "right" }}>{l.credit > 0 ? `${l.credit.toFixed(2)} €` : ""}</td>
                    <td style={{ fontSize: 13, color: "#6b675c" }}>{l.description ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {entries.length === 0 && <div className="card">Sin asientos en el período.</div>}
      </main>
    </>
  );
}
