"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addSaleLineAction,
  openSaleAction,
  paySaleAction,
  removeSaleLineAction,
  sendOrderAction,
  setSaleLineQuantityAction,
  type TicketDTO,
} from "@/modules/tpv/actions";
import { enqueueOp, getOps, removeOp, type QueuedOp } from "@/lib/tpv-queue";
import type { PaymentMethod } from "@prisma/client";

interface Category {
  id: string;
  name: string;
}
interface Product {
  id: string;
  name: string;
  price: number;
  taxPct: number;
  categoryId: string;
}
interface TableInfo {
  id: string;
  name: string;
  status: string;
  openSale: { id: string; number: string; total: number; waiter: string } | null;
}
interface SaleLineDTO {
  id: string;
  productId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxPct: number;
  total: number;
}
interface SaleDTO {
  id: string;
  number: string;
  tableId: string | null;
  waiter: string;
  lines: SaleLineDTO[];
}

interface DraftLine {
  lineId: string;
  productId: string;
  name: string;
  unitPrice: number;
  taxPct: number;
  quantity: number;
  synced: boolean;
}
interface DraftPayment {
  method: PaymentMethod;
  amount: number;
}

const METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "CASH", label: "Efectivo" },
  { value: "CARD", label: "Tarjeta" },
  { value: "CONTACTLESS", label: "Contactless" },
  { value: "BIZUM", label: "Bizum" },
  { value: "OTHER", label: "Otro" },
];

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

export default function TpvClient(props: {
  categories: Category[];
  products: Product[];
  tables: TableInfo[];
  initialSale: SaleDTO | null;
}) {
  const router = useRouter();
  const [sale, setSale] = useState<SaleDTO | null>(props.initialSale);
  const [lines, setLines] = useState<DraftLine[]>(() =>
    (props.initialSale?.lines ?? []).map((l) => ({
      lineId: l.id,
      productId: l.productId,
      name: l.description,
      unitPrice: l.unitPrice,
      taxPct: l.taxPct,
      quantity: l.quantity,
      synced: true,
    }))
  );
  const [categoryId, setCategoryId] = useState<string>(props.categories[0]?.id ?? "");
  const [payments, setPayments] = useState<DraftPayment[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [ticket, setTicket] = useState<TicketDTO | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [online, setOnline] = useState(true);
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [customAmount, setCustomAmount] = useState("");
  const [splitN, setSplitN] = useState("2");
  const [busy, setBusy] = useState(false);

  const total = useMemo(() => round2(lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)), [lines]);
  const paid = useMemo(() => round2(payments.reduce((s, p) => s + p.amount, 0)), [payments]);
  const remaining = round2(total - paid);
  const filtered = props.products.filter((p) => !categoryId || p.categoryId === categoryId);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (!sale) return;
    try {
      localStorage.setItem(`tpv:${sale.id}`, JSON.stringify({ lines, payments }));
    } catch {}
  }, [sale, lines, payments]);

  const syncQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    let ops: QueuedOp[] = [];
    try {
      ops = await getOps();
    } catch {
      return;
    }
    for (const op of ops) {
      try {
        let r: { ok: boolean } | undefined;
        const payload = op.payload as Record<string, unknown>;
        if (op.type === "addLine") r = await addSaleLineAction(payload as never);
        else if (op.type === "qty") r = await setSaleLineQuantityAction(payload as never);
        else if (op.type === "remove") r = await removeSaleLineAction(payload as never);
        else if (op.type === "send") r = await sendOrderAction(payload as never);
        else if (op.type === "pay") r = await paySaleAction(payload as never);
        if (r && r.ok) {
          await removeOp(op.id);
          if (op.type === "addLine" || op.type === "qty") {
            const lineId = payload.lineId as string;
            setLines((prev) => prev.map((l) => (l.lineId === lineId ? { ...l, synced: true } : l)));
          }
        }
      } catch {}
    }
  }, []);

  useEffect(() => {
    void syncQueue();
    const iv = setInterval(() => void syncQueue(), 5000);
    const on = () => void syncQueue();
    window.addEventListener("online", on);
    return () => {
      clearInterval(iv);
      window.removeEventListener("online", on);
    };
  }, [syncQueue]);

  async function run<T extends { ok: boolean }>(
    op: Omit<QueuedOp, "createdAt">,
    fn: () => Promise<T>
  ): Promise<T | null> {
    try {
      const r = await fn();
      if (!r.ok) setMsg({ kind: "error", text: (r as { message?: string }).message ?? "Error" });
      return r;
    } catch (e) {
      if (!navigator.onLine || e instanceof TypeError) {
        await enqueueOp({ ...op, createdAt: Date.now() });
        return null;
      }
      setMsg({ kind: "error", text: "Error de red" });
      return null;
    }
  }

  async function ensureSale(): Promise<string | null> {
    if (sale) return sale.id;
    setBusy(true);
    const r = await openSaleAction({ tableId: props.initialSale?.tableId ?? null });
    setBusy(false);
    if (!r.ok) {
      setMsg({ kind: "error", text: r.message });
      return null;
    }
    setSale({
      id: r.saleId,
      number: r.number,
      tableId: props.initialSale?.tableId ?? null,
      waiter: "",
      lines: [],
    });
    return r.saleId;
  }

  async function addProduct(p: Product) {
    const saleId = await ensureSale();
    if (!saleId) return;
    const existing = lines.find((l) => l.productId === p.id);
    const lineId = existing?.lineId ?? crypto.randomUUID();
    const qty = (existing?.quantity ?? 0) + 1;
    setLines((prev) =>
      existing
        ? prev.map((l) => (l.productId === p.id ? { ...l, quantity: qty, synced: false } : l))
        : [...prev, { lineId, productId: p.id, name: p.name, unitPrice: p.price, taxPct: p.taxPct, quantity: qty, synced: false }]
    );
    await run(
      { id: `add-${lineId}-${qty}`, type: "addLine", payload: { saleId, lineId, productId: p.id, quantity: qty } },
      () => addSaleLineAction({ saleId, lineId, productId: p.id, quantity: qty })
    );
  }

  async function changeQty(line: DraftLine, delta: number) {
    if (!sale) return;
    const qty = line.quantity + delta;
    if (qty <= 0) {
      setLines((prev) => prev.filter((l) => l.lineId !== line.lineId));
      await run(
        { id: `rm-${line.lineId}`, type: "remove", payload: { saleId: sale.id, lineId: line.lineId } },
        () => removeSaleLineAction({ saleId: sale.id, lineId: line.lineId })
      );
    } else {
      setLines((prev) => prev.map((l) => (l.lineId === line.lineId ? { ...l, quantity: qty, synced: false } : l)));
      await run(
        { id: `q-${line.lineId}-${qty}`, type: "qty", payload: { saleId: sale.id, lineId: line.lineId, quantity: qty } },
        () => setSaleLineQuantityAction({ saleId: sale.id, lineId: line.lineId, quantity: qty })
      );
    }
  }

  async function sendToKitchen() {
    if (!sale) return;
    const r = await run(
      { id: `send-${sale.id}-${Date.now()}`, type: "send", payload: { saleId: sale.id } },
      () => sendOrderAction({ saleId: sale.id })
    );
    if (r && r.ok) setMsg({ kind: "ok", text: "Comanda enviada a barra/cocina" });
    else if (!r) setMsg({ kind: "ok", text: "Sin conexión: la comanda se enviará al reconectar" });
  }

  function addPayment(amount: number, m: PaymentMethod) {
    if (amount <= 0) return;
    setPayments((prev) => [...prev, { method: m, amount: round2(amount) }]);
  }

  function splitEvenly() {
    const n = Math.max(1, Math.floor(Number(splitN) || 1));
    if (remaining <= 0) return;
    const base = Math.floor((remaining * 100) / n) / 100;
    const parts: DraftPayment[] = [];
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const amount = i === n - 1 ? round2(remaining - acc) : base;
      parts.push({ method, amount });
      acc = round2(acc + amount);
    }
    setPayments(parts);
  }

  async function cobrar() {
    if (!sale) return;
    if (remaining !== 0) {
      setMsg({ kind: "error", text: `Faltan ${remaining.toFixed(2)} € por asignar` });
      return;
    }
    setBusy(true);
    const idempotencyKey = crypto.randomUUID();
    const payload = { saleId: sale.id, idempotencyKey, payments };
    const r = await run({ id: idempotencyKey, type: "pay", payload }, () => paySaleAction(payload));
    setBusy(false);
    if (!r) {
      setMsg({ kind: "ok", text: "Sin conexión: el cobro quedó encolado y se enviará al reconectar." });
      setPayOpen(false);
      return;
    }
    if (r.ok) {
      setTicket(r.ticket);
      setPayOpen(false);
      setPayments([]);
      try {
        localStorage.removeItem(`tpv:${sale.id}`);
      } catch {}
      setSale(null);
      setLines([]);
      router.refresh();
    }
  }

  function nuevaVenta() {
    setTicket(null);
    setSale(null);
    setLines([]);
    setPayments([]);
    setMsg(null);
  }

  if (ticket) {
    return (
      <main style={{ maxWidth: 420 }}>
        <div className="ticket card">
          <h1 style={{ textAlign: "center" }}>Ticket</h1>
          <p style={{ textAlign: "center", margin: "0 0 12px" }}>
            Serie {ticket.seriesCode} nº {ticket.number} — {new Date(ticket.issueDate).toLocaleString("es-ES")}
          </p>
          <table>
            <tbody>
              {ticket.lines.map((l, i) => (
                <tr key={i}>
                  <td>
                    {l.quantity} × {l.description}
                  </td>
                  <td style={{ textAlign: "right" }}>{l.totalAmount.toFixed(2)} €</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
            <span>TOTAL</span>
            <span>{ticket.total.toFixed(2)} €</span>
          </p>
          <p style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span>Base</span>
            <span>{ticket.totalBase.toFixed(2)} €</span>
          </p>
          <p style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span>IVA</span>
            <span>{ticket.totalTax.toFixed(2)} €</span>
          </p>
          <p className="mono" style={{ wordBreak: "break-all", fontSize: 11 }}>
            Hash: {ticket.hash}
          </p>
        </div>
        <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => window.print()}>Imprimir</button>
          {ticket.invoiceId && (
            <a href={`/api/print/ticket?invoiceId=${ticket.invoiceId}`} download>
              <button type="button">Ticket ESC/POS</button>
            </a>
          )}
          <button onClick={nuevaVenta}>Nueva venta</button>
          <Link href="/dashboard"><button>Panel</button></Link>
        </div>
      </main>
    );
  }

  return (
    <>
      <header className="topbar no-print">
        <strong>TPV</strong>
        <Link href="/mesas">Mesas</Link>
        <Link href="/kds">Cocina</Link>
        <Link href="/dashboard">Panel</Link>
        <span style={{ marginLeft: "auto", fontSize: 13 }}>
          {online ? "● online" : "○ sin conexión (cola offline activa)"}
        </span>
      </header>
      <main className="no-print" style={{ maxWidth: 1100 }}>
        {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}
        <div className="tpv-grid">
          <section className="card">
            <div className="tpv-cats">
              {props.categories.map((c) => (
                <button
                  key={c.id}
                  className={c.id === categoryId ? "cat active" : "cat"}
                  onClick={() => setCategoryId(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <div className="tpv-products">
              {filtered.map((p) => (
                <button key={p.id} className="prod" onClick={() => void addProduct(p)} disabled={busy}>
                  <span>{p.name}</span>
                  <small>
                    {p.price.toFixed(2)} € · IVA {p.taxPct}%
                  </small>
                </button>
              ))}
            </div>
          </section>
          <section className="card">
            <h2>{sale ? `Venta ${sale.number}` : "Nueva venta"}</h2>
            {lines.length === 0 && <p style={{ color: "#6b675c" }}>Toca un producto para empezar.</p>}
            <table>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.lineId}>
                    <td>
                      {l.name} {!l.synced && <span className="badge" style={{ background: "#f3e8c8" }}>…</span>}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="mini" onClick={() => void changeQty(l, -1)}>−</button>
                      <strong style={{ margin: "0 6px" }}>{l.quantity}</strong>
                      <button className="mini" onClick={() => void changeQty(l, 1)}>+</button>
                    </td>
                    <td style={{ textAlign: "right" }}>{(l.quantity * l.unitPrice).toFixed(2)} €</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 18 }}>
              <span>Total</span>
              <span>{total.toFixed(2)} €</span>
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => void sendToKitchen()} disabled={!sale || lines.length === 0 || busy}>
                Enviar comanda
              </button>
              <button onClick={() => setPayOpen(true)} disabled={lines.length === 0 || busy}>
                Cobrar
              </button>
            </div>
          </section>
        </div>
      </main>

      {payOpen && (
        <div className="modal-backdrop no-print">
          <div className="modal card">
            <h2>Cobro — {total.toFixed(2)} €</h2>
            <p>
              Pagado: {paid.toFixed(2)} € — <strong>Restan: {remaining.toFixed(2)} €</strong>
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {METHODS.map((m) => (
                <button
                  key={m.value}
                  className={m.value === method ? "cat active" : "cat"}
                  onClick={() => setMethod(m.value)}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Importe"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
              />
              <button onClick={() => { addPayment(Number(customAmount), method); setCustomAmount(""); }}>
                Añadir pago
              </button>
              <button onClick={() => addPayment(remaining, method)}>Pago del resto</button>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                type="number"
                min="1"
                step="1"
                value={splitN}
                onChange={(e) => setSplitN(e.target.value)}
                style={{ width: 70 }}
              />
              <button onClick={splitEvenly}>Dividir cuenta entre N</button>
            </div>
            <table>
              <tbody>
                {payments.map((p, i) => (
                  <tr key={i}>
                    <td>{METHODS.find((m) => m.value === p.method)?.label}</td>
                    <td style={{ textAlign: "right" }}>{p.amount.toFixed(2)} €</td>
                    <td>
                      <button className="mini" onClick={() => setPayments((prev) => prev.filter((_, j) => j !== i))}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={() => void cobrar()} disabled={busy || remaining !== 0}>
                Confirmar cobro
              </button>
              <button className="secondary" onClick={() => setPayOpen(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
