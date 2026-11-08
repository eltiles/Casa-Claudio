"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { saveRecipeAction } from "@/modules/inventory/actions";

interface StockItem {
  id: string;
  name: string;
  unit: string;
  unitCost: number;
}
interface RecipeLine {
  stockItemId: string;
  quantity: number;
}

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

export default function RecetaEditor(props: {
  productId: string;
  productName: string;
  stockItems: StockItem[];
  initialLines: RecipeLine[];
}) {
  const router = useRouter();
  const [lines, setLines] = useState<RecipeLine[]>(props.initialLines);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const cost = useMemo(() => {
    return round2(
      lines.reduce((s, l) => {
        const item = props.stockItems.find((x) => x.id === l.stockItemId);
        return s + l.quantity * (item?.unitCost ?? 0);
      }, 0)
    );
  }, [lines, props.stockItems]);

  function update(i: number, patch: Partial<RecipeLine>) {
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function addLine() {
    if (!props.stockItems[0]) return;
    setLines((prev) => [...prev, { stockItemId: props.stockItems[0].id, quantity: 1 }]);
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await saveRecipeAction({ productId: props.productId, lines });
    setBusy(false);
    if (!r.ok) {
      setMsg({ kind: "error", text: r.message });
      return;
    }
    setMsg({ kind: "ok", text: `Escandallo guardado. Coste: ${r.costStd.toFixed(2)} €` });
    router.refresh();
  }

  return (
    <div>
      <p style={{ color: "#6b675c", fontSize: 13 }}>
        Receta de «{props.productName}»: unidades de materia prima por unidad de venta. El coste estándar se
        recalcula con el último precio de compra de cada artículo.
      </p>
      <table>
        <thead>
          <tr>
            <th>Materia prima</th>
            <th>Cantidad</th>
            <th>Coste unit.</th>
            <th>Subtotal</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const item = props.stockItems.find((x) => x.id === l.stockItemId);
            return (
              <tr key={i}>
                <td>
                  <select value={l.stockItemId} onChange={(e) => update(i, { stockItemId: e.target.value })}>
                    {props.stockItems.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.unit})
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={l.quantity}
                    onChange={(e) => update(i, { quantity: Number(e.target.value) })}
                    style={{ width: 100 }}
                  />
                </td>
                <td>{item ? `${item.unitCost.toFixed(4)} €/${item.unit}` : "—"}</td>
                <td>{item ? `${round2(l.quantity * item.unitCost).toFixed(2)} €` : "—"}</td>
                <td>
                  <button type="button" className="mini" onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}>
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="button" className="secondary" onClick={addLine} style={{ marginBottom: 12 }}>
        + añadir ingrediente
      </button>
      <p>
        <strong>Coste escandallo: {cost.toFixed(2)} €</strong>
      </p>
      {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}
      <button onClick={() => void save()} disabled={busy}>
        {busy ? "Guardando…" : "Guardar escandallo"}
      </button>
    </div>
  );
}
