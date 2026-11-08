import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { listUsers } from "@/modules/hr/service";
import PersonalPanel from "./personal-panel";

export const dynamic = "force-dynamic";

export default async function PersonalPage() {
  const session = await auth();
  if (!session?.user?.establishmentId) redirect("/login");
  if (!["ADMIN", "MANAGER"].includes(session.user.role)) redirect("/dashboard");
  const users = await listUsers(session.user.establishmentId);

  return (
    <>
      <header className="topbar">
        <strong>Personal</strong>
        <Link href="/dashboard">Panel</Link>
        <Link href="/turnos">Turnos</Link>
        <Link href="/comisiones">Comisiones</Link>
      </header>
      <main>
        <h1>Usuarios y accesos</h1>
        <PersonalPanel initialUsers={users} currentUserId={session.user.id} />
      </main>
    </>
  );
}
