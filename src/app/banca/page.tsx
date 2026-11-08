import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { listBankMovements, listSupplierPayments } from "@/modules/bank/service";
import BancaPanel from "./banca-panel";

export const dynamic = "force-dynamic";

export default async function BancaPage() {
  const session = await auth();
  if (!session?.user?.establishmentId) redirect("/login");
  if (!["ADMIN", "MANAGER", "ACCOUNTANT"].includes(session.user.role)) redirect("/dashboard");
  const establishmentId = session.user.establishmentId;

  const [accounts, movements, payments, suppliers] = await Promise.all([
    prisma.bankAccount.findMany({ where: { establishmentId }, orderBy: { name: "asc" } }),
    listBankMovements(establishmentId, 200),
    listSupplierPayments(establishmentId, 100),
    prisma.supplier.findMany({ where: { establishmentId }, orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <header className="topbar">
        <strong>Banca</strong>
        <Link href="/dashboard">Panel</Link>
        <Link href="/contabilidad">Contabilidad</Link>
        <Link href="/informes">Informes</Link>
      </header>
      <main>
        <h1>Conciliación bancaria</h1>
        <BancaPanel
          accounts={accounts.map((a) => ({ id: a.id, name: a.name, iban: a.iban }))}
          movements={movements}
          payments={payments}
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        />
      </main>
    </>
  );
}
