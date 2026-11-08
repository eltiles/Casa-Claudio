"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createPurchaseAction, createSupplierAction } from "@/modules/inventory/actions";

interface Supplier {
  id: string;
  name: string;
  nif: string | null;
}
interface StockItem {
  id: string;
  name: string;
  unit: string;
  unitCost: number;
}
interface TaxRate {
  id: string;
  label: string;
  rate: number;
}
interface Line {
  stockItemId: string;
  quantity: number;
  unitCost: number;
  taxRatePct: number;
}

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

export default function CompraForm(props: {
  suppliers: Supplier[];
  stockItems: StockItem[];
  taxRates: TaxRate[];
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(props.suppliers[0]?.id ?? "");
  const [newSupplier, setNewSupplier] = useState({ name: "", nif: "" });
  const [number, setNumber] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<Line[]>(
    props.stockItems[0]
      ? [{ stockItemId: props.stockItems[0].id, quantity: 1, unitCost: props.stockItems[0].unitCost, taxRatePct: 0.21 }]
      : []
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const totals = useMemo(() => {
    const base = round2(lines.reduce((s, l) => s + l.quantity * l.unitCost, 0));
    const tax = round2(lines.reduce((s, l) => s + l.quantity * l.unitCost * l.taxRatePct, 0));
    return { base, tax, total: round2(base + tax) };
  }, [lines]);

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function addLine() {
    const first = props.stockItems[0];
    if (!first) return;
    setLines((prev) => [...prev, { stockItemId: first.id, quantity: 1, unitCost: first.unitCost, taxRatePct: 0.21 }]);
  }

  async function crearProveedor() {
    if (!newSupplier.name.trim()) return;
    setBusy(true);
    const r = await createSupplierAction({ name: newSupplier.name, nif: newSupplier.nif || undefined });
    setBusy(false);
    if (r.ok) {
      setSupplierId(r.supplierId);
      setNewSupplier({ name: "", nif: "" });
      router.refresh();
    } else {
      setMsg({ kind: "error", text: r.message });
    }
  }

  async function submit() {
    if (!supplierId) {
      setMsg({ kind: "error", text: "Selecciona o crea un proveedor" });
      return;
    }
    if (!number.trim()) {
      setMsg({ kind: "error", text: "Indica el número de factura" });
      return;
    }
    if (lines.length === 0) {
      setMsg({ kind: "error", text: "Añade al menos una línea" });
      return;
    }
    setBusy(true);
    setMsg(null);
    const r = await createPurchaseAction({
      supplierId,
      number,
      issueDate,
      lines: lines.map((l) => ({
        stockItemId: l.stockItemId,
        description: props.stockItems.find((s) => s.id === l.stockItemId)?.name ?? "",
        quantity: l.quantity,
        unitCost: l.unitCost,
        taxRatePct: l.taxRatePct,
      })),
    });
    setBusy(false);
    if (!r.ok) {
      setMsg({ kind: "error", text: r.message });
      return;
    }
    router.push("/inventario");
    router.refresh();
  }

  return (
    <div>
      <label>Proveedor</label>
      <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
        {props.suppliers.length === 0 && <option value="">— sin proveedores —</option>}
        {props.suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} {s.nif ? `(${s.nif})` : ""}
          </option>
        ))}
      </select>
      <details style={{ marginBottom: 12 }}>
        <summary style={{ cursor: "pointer", fontSize: 13, color: "#6b675c" }}>+ nuevo proveedor</summary>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input placeholder="Nombre" value={newSupplier.name} onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })} />
          <input placeholder="NIF" value={newSupplier.nif} onChange={(e) => setNewSupplier({ ...newSupplier, nif: e.target.value })} />
          <button type="button" className="secondary" onClick={() => void crearProveedor()} disabled={busy}>
            Crear
          </button>
        </div>
      </details>

      <div className="grid2">
        <div>
          <label>Nº factura / albarán</label>
          <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="F-2026-001" />
        </div>
        <div>
          <label>Fecha</label>
          <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </div>
      </div>

      <h2>Líneas</h2>
      <table>
        <thead>
          <tr>
            <th>Artículo</th>
            <th>Cantidad</th>
            <th>Coste unit.</th>
            <th>IVA</th>
            <th>Importe</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td>
                <select value={l.stockItemId} onChange={(e) => {
                  const item = props.stockItems.find((s) => s.id === e.target.value);
                  updateLine(i, { stockItemId: e.target.value, unitCost: item?.unitCost ?? l.unitCost });
                }}>
                  {props.stockItems.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.unit})
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input type="number" min="0" step="0.001" value={l.quantity} onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })} style={{ width: 90 }} />
              </td>
              <td>
                <input type="number" min="0" step="0.0001" value={l.unitCost} onChange={(e) => updateLine(i, { unitCost: Number(e.target.value) })} style={{ width: 100 }} />
              </td>
              <td>
                <select value={l.taxRatePct} onChange={(e) => updateLine(i, { taxRatePct: Number(e.target.value) })}>
                  {props.taxRates.map((t) => (
                    <option key={t.id} value={t.rate}>
                      {(t.rate * 100).toFixed(0)}%
                    </option>
                  ))}
                </select>
              </td>
              <td>{(l.quantity * l.unitCost).toFixed(2)} €</td>
              <td>
                <button type="button" className="mini" onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="secondary" onClick={addLine} style={{ marginBottom: 12 }}>
        + añadir línea
      </button>

      <p>
        Base {totals.base.toFixed(2)} € · IVA {totals.tax.toFixed(2)} € · <strong>Total {totals.total.toFixed(2)} €</strong>
      </p>
      {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}
      <button onClick={() => void submit()} disabled={busy}>
        {busy ? "Registrando…" : "Registrar compra (entra stock + asiento)"}
      </button>
    </div>
  );
}
