import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { listShifts } from "@/modules/hr/service";
import TurnosPanel from "./turnos-panel";

export const dynamic = "force-dynamic";

export default async function TurnosPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.establishmentId) redirect("/login");
  const establishmentId = session.user.establishmentId;
  const sp = await searchParams;
  const fecha = sp.fecha ?? new Date().toISOString().slice(0, 10);
  const [shifts, myOpen] = await Promise.all([
    listShifts(establishmentId, fecha),
    prisma.shift.findFirst({ where: { userId: session.user.id, end: null } }),
  ]);

  return (
    <>
      <header className="topbar">
        <strong>Turnos</strong>
        <Link href="/dashboard">Panel</Link>
        <Link href="/personal">Personal</Link>
        <Link href="/comisiones">Comisiones</Link>
      </header>
      <main>
        <h1>Fichajes — {fecha}</h1>
        <TurnosPanel shifts={shifts} myOpen={myOpen ? myOpen.start.toISOString() : null} fecha={fecha} />
      </main>
    </>
  );
}
