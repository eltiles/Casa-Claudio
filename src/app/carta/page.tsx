import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { listRecipes } from "@/modules/inventory/service";

export const dynamic = "force-dynamic";

export default async function CartaPage() {
  const session = await auth();
  if (!session?.user?.establishmentId) redirect("/login");
  const recipes = await listRecipes(session.user.establishmentId);

  return (
    <>
      <header className="topbar">
        <strong>Carta y escandallos</strong>
        <Link href="/inventario">Inventario</Link>
        <Link href="/dashboard">Panel</Link>
        <Link href="/tpv">TPV</Link>
      </header>
      <main>
        <h1>Productos, costes y márgenes</h1>
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Categoría</th>
                <th>Precio</th>
                <th>IVA</th>
                <th>Coste (escandallo)</th>
                <th>Margen</th>
                <th>Margen %</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recipes.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.category}</td>
                  <td>{p.price.toFixed(2)} €</td>
                  <td>{p.taxPct}%</td>
                  <td>{p.costStd.toFixed(2)} €</td>
                  <td>{p.margin.toFixed(2)} €</td>
                  <td>{p.marginPct.toFixed(1)}%</td>
                  <td>
                    <Link href={`/carta/${p.id}`}>
                      <button className="mini">Escandallo</button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
