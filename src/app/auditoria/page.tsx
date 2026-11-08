import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AuditoriaPage() {
  const session = await auth();
  if (!session?.user?.establishmentId) redirect("/login");
  if (!["ADMIN", "ACCOUNTANT"].includes(session.user.role)) redirect("/dashboard");

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { actor: true },
  });

  return (
    <>
      <header className="topbar">
        <strong>Auditoría</strong>
        <Link href="/dashboard">Panel</Link>
        <Link href="/personal">Personal</Link>
        <Link href="/fiscal">Modelos</Link>
      </header>
      <main>
        <h1>Registro de auditoría (append-only)</h1>
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Actor</th>
                <th>Acción</th>
                <th>Entidad</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td>{l.createdAt.toLocaleString("es-ES")}</td>
                  <td>{l.actor ? `${l.actor.name}` : "sistema"}</td>
                  <td className="mono">{l.action}</td>
                  <td className="mono">{l.entityType}{l.entityId ? ` ${l.entityId.slice(0, 8)}…` : ""}</td>
                  <td style={{ fontSize: 12 }}>
                    {l.after ? <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(l.after)}</pre> : "—"}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={5} style={{ color: "#6b675c" }}>Sin eventos de auditoría.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
