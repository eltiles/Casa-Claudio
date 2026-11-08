import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import KdsClient from "./kds-client";

export const dynamic = "force-dynamic";

export default async function KdsPage() {
  const session = await auth();
  if (!session?.user?.establishmentId) redirect("/login");
  if (!["ADMIN", "MANAGER", "WAITER"].includes(session.user.role)) redirect("/dashboard");
  return (
    <>
      <header className="topbar">
        <strong>Cocina / Barra (KDS)</strong>
        <Link href="/tpv">TPV</Link>
        <Link href="/mesas">Mesas</Link>
        <Link href="/dashboard">Panel</Link>
      </header>
      <main>
        <KdsClient />
      </main>
    </>
  );
}
