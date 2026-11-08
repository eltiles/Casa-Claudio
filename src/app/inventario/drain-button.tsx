"use client";

import { useState, useTransition } from "react";
import { drainOutboxAction } from "@/modules/inventory/actions";

export default function DrainButton() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function drain() {
    startTransition(async () => {
      const r = await drainOutboxAction();
      setMsg(r.ok ? `Procesados: ${r.processed}, fallidos: ${r.failed.length}` : r.message);
    });
  }

  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <button className="secondary" onClick={drain} disabled={pending}>
        {pending ? "Procesando…" : "Procesar eventos"}
      </button>
      {msg && <small style={{ color: "#6b675c" }}>{msg}</small>}
    </span>
  );
}
