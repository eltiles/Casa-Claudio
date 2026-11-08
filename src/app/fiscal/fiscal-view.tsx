"use client";

import { useCallback, useEffect, useState } from "react";

interface Modelo303 {
  modelo: string;
  year: number;
  quarter: number;
  from: string;
  to: string;
  devengado: { porTipo: Record<string, { base: number; cuota: number }>; totalBase: number; totalCuota: number };
  deducido: { porTipo: Record<string, { base: number; cuota: number }>; totalBase: number; totalCuota: number };
  resultado: number;
  nota: string;
}

interface Modelo347 {
  modelo: string;
  year: number;
  umbral: number;
  proveedores: Array<{ nif: string | null; name: string; total: number }>;
  clientes: Array<{ nif: string; name: string | null; total: number }>;
}

export default function FiscalView() {
  const year = new Date().getFullYear();
  const [y, setY] = useState(year);
  const [q, setQ] = useState(Math.ceil((new Date().getMonth() + 1) / 3));
  const [m303, setM303] = useState<Modelo303 | null>(null);
  const [m347, setM347] = useState<Modelo347 | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [a, b] = await Promise.all([
      fetch(`/api/fiscal/model303?year=${y}&quarter=${q}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error("303")))),
      fetch(`/api/fiscal/model347?year=${y}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error("347")))),
    ]);
    setM303(a);
    setM347(b);
  }, [y, q]);

  useEffect(() => {
    load().catch(() => setError("No se pudieron cargar los modelos"));
  }, [load]);

  return (
    <>
      <div className="card" style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
        <div>
          <label>Año</label>
          <input type="number" value={y} onChange={(e) => setY(Number(e.target.value))} style={{ width: 100 }} />
        </div>
        <div>
          <label>Trimestre (303)</label>
          <select value={q} onChange={(e) => setQ(Number(e.target.value))} style={{ width: 100 }}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                T{n}
              </option>
            ))}
          </select>
        </div>
        <button className="secondary" onClick={() => void load()}>
          Recargar
        </button>
      </div>
      {error && <div className="alert error">{error}</div>}

      {m303 && (
        <div className="card">
          <h2>Modelo 303 — IVA T{q} {y}</h2>
          <p style={{ color: "#6b675c", fontSize: 13 }}>
            {m303.from} → {m303.to}. {m303.nota}
          </p>
          <div className="grid2">
            <div>
              <h2 style={{ fontSize: 14 }}>IVA devengado (repercutido)</h2>
              <table>
                <thead>
                  <tr><th>Tipo</th><th style={{ textAlign: "right" }}>Base</th><th style={{ textAlign: "right" }}>Cuota</th></tr>
                </thead>
                <tbody>
                  {Object.entries(m303.devengado.porTipo).map(([rate, v]) => (
                    <tr key={rate}>
                      <td>{(Number(rate) * 100).toFixed(0)}%</td>
                      <td style={{ textAlign: "right" }}>{v.base.toFixed(2)} €</td>
                      <td style={{ textAlign: "right" }}>{v.cuota.toFixed(2)} €</td>
                    </tr>
                  ))}
                  <tr>
                    <td><strong>Total</strong></td>
                    <td style={{ textAlign: "right" }}><strong>{m303.devengado.totalBase.toFixed(2)} €</strong></td>
                    <td style={{ textAlign: "right" }}><strong>{m303.devengado.totalCuota.toFixed(2)} €</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div>
              <h2 style={{ fontSize: 14 }}>IVA deducible (soportado)</h2>
              <table>
                <thead>
                  <tr><th>Tipo</th><th style={{ textAlign: "right" }}>Base</th><th style={{ textAlign: "right" }}>Cuota</th></tr>
                </thead>
                <tbody>
                  {Object.entries(m303.deducido.porTipo).map(([rate, v]) => (
                    <tr key={rate}>
                      <td>{(Number(rate) * 100).toFixed(0)}%</td>
                      <td style={{ textAlign: "right" }}>{v.base.toFixed(2)} €</td>
                      <td style={{ textAlign: "right" }}>{v.cuota.toFixed(2)} €</td>
                    </tr>
                  ))}
                  <tr>
                    <td><strong>Total</strong></td>
                    <td style={{ textAlign: "right" }}><strong>{m303.deducido.totalBase.toFixed(2)} €</strong></td>
                    <td style={{ textAlign: "right" }}><strong>{m303.deducido.totalCuota.toFixed(2)} €</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <p>
            <strong>Resultado (a ingresar si es positivo): {m303.resultado.toFixed(2)} €</strong>
          </p>
        </div>
      )}

      {m347 && (
        <div className="card">
          <h2>Modelo 347 — Operaciones con terceros {y} (umbral {m347.umbral.toFixed(2)} €)</h2>
          <div className="grid2">
            <div>
              <h2 style={{ fontSize: 14 }}>Proveedores</h2>
              <table>
                <tbody>
                  {m347.proveedores.map((p) => (
                    <tr key={p.name}>
                      <td>{p.name} {p.nif && <span className="mono">({p.nif})</span>}</td>
                      <td style={{ textAlign: "right" }}>{p.total.toFixed(2)} €</td>
                    </tr>
                  ))}
                  {m347.proveedores.length === 0 && (
                    <tr><td style={{ color: "#6b675c" }}>Ninguno supera el umbral</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div>
              <h2 style={{ fontSize: 14 }}>Clientes (facturas completas con NIF)</h2>
              <table>
                <tbody>
                  {m347.clientes.map((c) => (
                    <tr key={c.nif}>
                      <td>{c.name ?? c.nif} <span className="mono">({c.nif})</span></td>
                      <td style={{ textAlign: "right" }}>{c.total.toFixed(2)} €</td>
                    </tr>
                  ))}
                  {m347.clientes.length === 0 && (
                    <tr><td style={{ color: "#6b675c" }}>Ninguno supera el umbral</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
