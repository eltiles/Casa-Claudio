import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import MesasClient from "./mesas-client";

export const dynamic = "force-dynamic";

export default async function MesasPage() {
  const session = await auth();
  if (!session?.user?.establishmentId) redirect("/login");
  if (!["ADMIN", "MANAGER", "WAITER"].includes(session.user.role)) redirect("/dashboard");
  const establishmentId = session.user.establishmentId;

  const tables = await prisma.diningTable.findMany({
    where: { establishmentId },
    include: {
      sales: {
        where: { status: "OPEN" },
        include: { waiter: true, lines: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <header className="topbar">
        <strong>Mesas</strong>
        <Link href="/tpv">TPV</Link>
        <Link href="/kds">Cocina</Link>
        <Link href="/dashboard">Panel</Link>
      </header>
      <main>
        <h1>Mesas</h1>
        <MesasClient
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
                  lineCount: t.sales[0].lines.length,
                }
              : null,
          }))}
        />
      </main>
    </>
  );
}
