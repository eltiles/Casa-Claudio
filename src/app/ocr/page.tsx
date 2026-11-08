import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { listOcrDrafts } from "@/modules/ocr/service";
import OcrPanel from "./ocr-panel";

export const dynamic = "force-dynamic";

export default async function OcrPage() {
  const session = await auth();
  if (!session?.user?.establishmentId) redirect("/login");
  if (!["ADMIN", "MANAGER", "ACCOUNTANT"].includes(session.user.role)) redirect("/dashboard");
  const drafts = await listOcrDrafts(session.user.establishmentId);

  return (
    <>
      <header className="topbar">
        <strong>OCR de facturas</strong>
        <Link href="/compras">Compras</Link>
        <Link href="/dashboard">Panel</Link>
      </header>
      <main>
        <h1>Escaneo de facturas de proveedores</h1>
        <OcrPanel initialDrafts={drafts} />
      </main>
    </>
  );
}
