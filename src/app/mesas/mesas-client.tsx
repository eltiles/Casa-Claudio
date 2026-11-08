"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { openSaleAction } from "@/modules/tpv/actions";

interface TableDTO {
  id: string;
  name: string;
  status: string;
  openSale: { id: string; number: string; total: number; waiter: string; lineCount: number } | null;
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  FREE: { label: "Libre", cls: "ok" },
  OCCUPIED: { label: "Ocupada", cls: "bad" },
  PENDING_PAYMENT: { label: "Pendiente de pago", cls: "warn" },
};

export default function MesasClient({ tables }: { tables: TableDTO[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function abrirMesa(tableId: string) {
    setError(null);
    startTransition(async () => {
      const r = await openSaleAction({ tableId });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      router.push(`/tpv?venta=${r.saleId}`);
      router.refresh();
    });
  }

  return (
    <>
      {error && <div className="alert error">{error}</div>}
      <div className="mesas-grid">
        {tables.map((t) => {
          const st = STATUS_LABEL[t.status] ?? { label: t.status, cls: "" };
          return (
            <div key={t.id} className="card mesa-card">
              <h2 style={{ marginTop: 0 }}>{t.name}</h2>
              <p>
                <span className={`badge ${st.cls}`}>{st.label}</span>
              </p>
              {t.openSale ? (
                <>
                  <p style={{ margin: "8px 0" }}>
                    Venta <strong>{t.openSale.number}</strong>
                    <br />
                    {t.openSale.lineCount} líneas — {t.openSale.total.toFixed(2)} €
                    <br />
                    <small style={{ color: "#6b675c" }}>{t.openSale.waiter}</small>
                  </p>
                  <Link href={`/tpv?venta=${t.openSale.id}`}>
                    <button>Ir al TPV</button>
                  </Link>
                </>
              ) : (
                <button onClick={() => abrirMesa(t.id)} disabled={pending}>
                  {pending ? "Abriendo…" : "Abrir mesa"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
