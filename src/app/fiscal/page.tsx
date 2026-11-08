import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import FiscalView from "./fiscal-view";
import EinvoicingPanel from "./einvoicing-panel";

export const dynamic = "force-dynamic";

export default async function FiscalPage() {
  const session = await auth();
  if (!session?.user?.establishmentId) redirect("/login");
  if (!["ADMIN", "MANAGER", "ACCOUNTANT"].includes(session.user.role)) redirect("/dashboard");
  return (
    <>
      <header className="topbar">
        <strong>Modelos fiscales</strong>
        <Link href="/dashboard">Panel</Link>
        <Link href="/contabilidad">Contabilidad</Link>
        <Link href="/informes">Informes</Link>
      </header>
      <main>
        <h1>Modelos (borradores para el asesor fiscal)</h1>
        <FiscalView />
        <EinvoicingPanel />
      </main>
    </>
  );
}
