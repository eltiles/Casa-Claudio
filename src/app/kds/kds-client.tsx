"use client";

import { useEffect, useState } from "react";
import { setOrderLineStatusAction } from "@/modules/tpv/actions";
import type { OrderLineStatus } from "@/modules/orders/service";

interface KdsLine {
  id: string;
  name: string;
  quantity: number;
  status: string;
  note: string | null;
}
interface KdsOrder {
  id: string;
  status: string;
  sentAt: string | null;
  table: string;
  lines: KdsLine[];
}

const NEXT_STATUS: Record<string, OrderLineStatus> = {
  PENDING: "PREPARING",
  PREPARING: "READY",
};

export default function KdsClient() {
  const [orders, setOrders] = useState<KdsOrder[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/kds/stream");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as { orders: KdsOrder[] };
        setOrders(data.orders);
      } catch {}
    };
    return () => es.close();
  }, []);

  async function advance(line: KdsLine) {
    const next = NEXT_STATUS[line.status];
    if (!next) return;
    const r = await setOrderLineStatusAction({ lineId: line.id, status: next });
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setOrders((prev) =>
      prev.map((o) =>
        o.lines.some((l) => l.id === line.id)
          ? { ...o, lines: o.lines.map((l) => (l.id === line.id ? { ...l, status: next } : l)) }
          : o
      )
    );
  }

  const active = orders.filter((o) => o.status === "SENT_TO_KITCHEN");
  const done = orders.filter((o) => o.status === "SERVED");

  return (
    <>
      <h1>Comandas</h1>
      <p style={{ color: "#6b675c" }}>{connected ? "● en vivo" : "○ reconectando…"}</p>
      {error && <div className="alert error">{error}</div>}
      <h2>Pendientes ({active.length})</h2>
      {active.length === 0 && <p style={{ color: "#6b675c" }}>No hay comandas pendientes.</p>}
      <div className="kds-grid">
        {active.map((o) => (
          <div key={o.id} className="card">
            <h2 style={{ marginTop: 0 }}>
              {o.table} — {o.sentAt ? new Date(o.sentAt).toLocaleTimeString("es-ES") : ""}
            </h2>
            {o.lines.map((l) => (
              <div key={l.id} className="kds-line">
                <span>
                  <strong>{l.quantity}×</strong> {l.name}
                  {l.note ? <small> ({l.note})</small> : null}
                </span>
                <button onClick={() => void advance(l)}>
                  {l.status === "PENDING" ? "Preparar" : l.status === "PREPARING" ? "Listo" : l.status}
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
      {done.length > 0 && (
        <>
          <h2>Servidas ({done.length})</h2>
          <div className="kds-grid">
            {done.map((o) => (
              <div key={o.id} className="card" style={{ opacity: 0.6 }}>
                <h2 style={{ marginTop: 0 }}>{o.table}</h2>
                {o.lines.map((l) => (
                  <div key={l.id} className="kds-line">
                    <span>
                      <strong>{l.quantity}×</strong> {l.name}
                    </span>
                    <span className="badge ok">Listo</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
