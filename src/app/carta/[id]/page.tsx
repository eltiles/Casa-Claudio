import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import RecetaEditor from "./receta-editor";

export const dynamic = "force-dynamic";

export default async function RecetaPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.establishmentId) redirect("/login");
  const { id } = await params;
  const establishmentId = session.user.establishmentId;

  const [product, stockItems] = await Promise.all([
    prisma.product.findFirst({
      where: { id, establishmentId },
      include: { recipe: { include: { lines: true } }, taxRate: true },
    }),
    prisma.stockItem.findMany({ where: { establishmentId, active: true }, orderBy: { name: "asc" } }),
  ]);
  if (!product) notFound();

  return (
    <>
      <header className="topbar">
        <strong>Escandallo</strong>
        <Link href="/carta">Carta</Link>
        <Link href="/inventario">Inventario</Link>
      </header>
      <main style={{ maxWidth: 760 }}>
        <h1>
          {product.name} — {Number(product.price).toFixed(2)} € (IVA {Number(product.taxRate.rate) * 100}%)
        </h1>
        <div className="card">
          <RecetaEditor
            productId={product.id}
            productName={product.name}
            stockItems={stockItems.map((s) => ({
              id: s.id,
              name: s.name,
              unit: s.unit,
              unitCost: Number(s.unitCost),
            }))}
            initialLines={(product.recipe?.lines ?? []).map((l) => ({
              stockItemId: l.stockItemId,
              quantity: Number(l.quantity),
            }))}
          />
        </div>
      </main>
    </>
  );
}
