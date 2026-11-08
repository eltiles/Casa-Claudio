"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { sendVerifactuAction } from "@/modules/einvoicing/actions";

interface Status {
  byStatus: Record<string, number>;
  ticketbai: boolean;
  endpointConfigured: boolean;
  siiRequired: boolean;
}

export default function EinvoicingPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/einvoicing/status");
    if (r.ok) setStatus(await r.json());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function enviar() {
    setMsg(null);
    startTransition(async () => {
      const r = await sendVerifactuAction();
      if (!r.ok) return setMsg({ kind: "error", text: r.message });
      setMsg({
        kind: "ok",
        text: `Enviados ${r.sent}, errores ${r.errors.length}. Adaptador: ${r.sender}. TicketBAI: ${r.ticketbai ? "sí" : "no"}, SII: ${r.siiRequired ? "obligatorio" : "no aplica"}`,
      });
      void load();
    });
  }

  return (
    <div className="card">
      <h2>Facturación electrónica (Verifactu / TicketBAI / SII)</h2>
      {status ? (
        <table>
          <tbody>
            <tr><td>Estado de envío</td><td>{Object.entries(status.byStatus).map(([k, v]) => `${k}: ${v}`).join(" · ") || "—"}</td></tr>
            <tr><td>TicketBAI (País Vasco/Navarra)</td><td>{status.ticketbai ? "activado (TICKETBAI_ENABLED)" : "no"}</td></tr>
            <tr><td>SII (más de 6,01 M€ facturación)</td><td>{status.siiRequired ? "obligatorio" : "no aplica"}</td></tr>
            <tr><td>Endpoint AEAT configurado</td><td>{status.endpointConfigured ? "sí (VERIFACTU_ENDPOINT)" : "no — modo registro local simulado"}</td></tr>
          </tbody>
        </table>
      ) : (
        <p>Cargando…</p>
      )}
      {msg && <div className={`alert ${msg.kind}`} style={{ marginTop: 8 }}>{msg.text}</div>}
      <button onClick={enviar} disabled={pending} style={{ marginTop: 8 }}>
        {pending ? "Enviando…" : "Enviar registros pendientes"}
      </button>
    </div>
  );
}
