"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveOcrDraftAction,
  parseInvoiceAction,
  saveOcrDraftAction,
} from "@/modules/ocr/actions";
import type { ParsedInvoice } from "@/modules/ocr/service";

interface DraftDTO {
  id: string;
  number: string;
  supplier: string;
  nif: string | null;
  issueDate: string;
  total: number;
  confidence: number | null;
  createdAt: string;
}

export default function OcrPanel({ initialDrafts }: { initialDrafts: DraftDTO[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedInvoice | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  function extraer() {
    setMsg(null);
    startTransition(async () => {
      const r = await parseInvoiceAction(text);
      if (!r.ok) {
        setMsg({ kind: "error", text: r.message });
        return;
      }
      setParsed(r.parsed);
      setMsg({ kind: "ok", text: `Extraído con confianza ${(r.parsed.confidence * 100).toFixed(0)}%` });
    });
  }

  function guardar() {
    if (!parsed) return;
    setMsg(null);
    startTransition(async () => {
      const r = await saveOcrDraftAction({ parsed, rawText: text });
      if (!r.ok) {
        setMsg({ kind: "error", text: r.message });
        return;
      }
      setMsg({ kind: "ok", text: `Borrador guardado: ${r.number} (${r.total.toFixed(2)} €)` });
      setParsed(null);
      setText("");
      router.refresh();
    });
  }

  function aprobar(id: string) {
    setMsg(null);
    startTransition(async () => {
      const r = await approveOcrDraftAction({ id });
      if (!r.ok) {
        setMsg({ kind: "error", text: r.message });
        return;
      }
      setMsg({ kind: "ok", text: "Factura aprobada y contabilizada (stock + asiento)" });
      router.refresh();
    });
  }

  return (
    <>
      <div className="card">
        <h2>Pegar texto de la factura (PDF/imagen: extraer texto antes; el OCR por imagen va con proveedor externo en Fase 5)</h2>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          style={{ width: "100%", fontFamily: "ui-monospace, monospace", fontSize: 12, padding: 8, borderRadius: 8, border: "1px solid #cfcabb" }}
          placeholder={"Distribuidora Bebidas SA\nNIF: B87654321\nFactura nº F-2026-045\nFecha: 12/03/2026\nBase imponible 100,00 €\nIVA 21% 21,00 €\nTOTAL 121,00 €"}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={extraer} disabled={pending || text.length < 20}>
            Extraer campos (OCR)
          </button>
          <button onClick={guardar} disabled={pending || !parsed}>
            Guardar borrador
          </button>
        </div>
        {msg && <div className={`alert ${msg.kind}`} style={{ marginTop: 8 }}>{msg.text}</div>}
        {parsed && (
          <table style={{ marginTop: 12 }}>
            <tbody>
              <tr><td>Proveedor</td><td>{parsed.supplierName ?? "—"}</td></tr>
              <tr><td>NIF</td><td className="mono">{parsed.supplierNif ?? "—"}</td></tr>
              <tr><td>Nº factura</td><td className="mono">{parsed.number ?? "—"}</td></tr>
              <tr><td>Fecha</td><td>{parsed.date ?? "—"}</td></tr>
              <tr><td>Base</td><td>{parsed.base?.toFixed(2) ?? "—"} €</td></tr>
              <tr><td>IVA {parsed.taxPct !== null ? `${(parsed.taxPct * 100).toFixed(0)}%` : ""}</td><td>{parsed.tax?.toFixed(2) ?? "—"} €</td></tr>
              <tr><td><strong>Total</strong></td><td><strong>{parsed.total?.toFixed(2) ?? "—"} €</strong></td></tr>
              {parsed.notes.map((n, i) => (
                <tr key={i}><td colSpan={2} style={{ color: "#a12323", fontSize: 13 }}>⚠ {n}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Borradores pendientes de revisión ({initialDrafts.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Proveedor</th>
              <th>Nº</th>
              <th>Fecha</th>
              <th>Total</th>
              <th>Confianza</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {initialDrafts.map((d) => (
              <tr key={d.id}>
                <td>{d.supplier} {d.nif && <span className="mono">({d.nif})</span>}</td>
                <td className="mono">{d.number}</td>
                <td>{d.issueDate}</td>
                <td style={{ textAlign: "right" }}>{d.total.toFixed(2)} €</td>
                <td>{d.confidence === null ? "—" : `${(d.confidence * 100).toFixed(0)}%`}</td>
                <td>
                  <button className="mini" onClick={() => aprobar(d.id)} disabled={pending}>
                    Aprobar y contabilizar
                  </button>
                </td>
              </tr>
            ))}
            {initialDrafts.length === 0 && (
              <tr><td colSpan={6} style={{ color: "#6b675c" }}>No hay borradores pendientes.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
