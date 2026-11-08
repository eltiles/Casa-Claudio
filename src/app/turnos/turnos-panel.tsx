"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clockInAction, clockOutAction } from "@/modules/hr/actions";

interface ShiftDTO {
  id: string;
  user: string;
  email: string;
  role: string;
  start: string;
  end: string | null;
  breakMinutes: number;
  hours: number | null;
}

export default function TurnosPanel({
  shifts,
  myOpen,
  fecha,
}: {
  shifts: ShiftDTO[];
  myOpen: string | null;
  fecha: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  function fichar() {
    setMsg(null);
    startTransition(async () => {
      const r = myOpen ? await clockOutAction() : await clockInAction();
      if (!r.ok) return setMsg({ kind: "error", text: r.message });
      const end = "end" in r ? r.end : null;
      setMsg({
        kind: "ok",
        text: myOpen
          ? `Salida registrada a las ${new Date(end ?? new Date()).toLocaleTimeString("es-ES")}`
          : "Entrada registrada",
      });
      router.refresh();
    });
  }

  const totalHours = shifts.reduce((s, x) => s + (x.hours ?? 0), 0);
  const ayer = new Date(`${fecha}T00:00:00`);
  ayer.setDate(ayer.getDate() - 1);
  const manana = new Date(`${fecha}T00:00:00`);
  manana.setDate(manana.getDate() + 1);

  return (
    <>
      <div className="card" style={{ maxWidth: 560 }}>
        <h2>Mi fichaje</h2>
        <p>
          {myOpen ? (
            <>Entrada abierta desde <strong>{new Date(myOpen).toLocaleTimeString("es-ES")}</strong></>
          ) : (
            <>No tienes fichaje abierto.</>
          )}
        </p>
        <button onClick={fichar} disabled={pending}>
          {pending ? "…" : myOpen ? "Fichar salida" : "Fichar entrada"}
        </button>
        {msg && <div className={`alert ${msg.kind}`} style={{ marginTop: 8 }}>{msg.text}</div>}
        <p style={{ marginTop: 12, fontSize: 13 }}>
          <Link href={`/turnos?fecha=${ayer.toISOString().slice(0, 10)}`}>← día anterior</Link> ·{" "}
          <Link href={`/turnos?fecha=${manana.toISOString().slice(0, 10)}`}>día siguiente →</Link>
        </p>
      </div>

      <div className="card">
        <h2>Turnos del día ({shifts.length}) — total {totalHours.toFixed(2)} h</h2>
        <table>
          <thead>
            <tr>
              <th>Empleado</th>
              <th>Rol</th>
              <th>Entrada</th>
              <th>Salida</th>
              <th>Descanso</th>
              <th style={{ textAlign: "right" }}>Horas</th>
            </tr>
          </thead>
          <tbody>
            {shifts.map((s) => (
              <tr key={s.id}>
                <td>{s.user}</td>
                <td>{s.role}</td>
                <td>{new Date(s.start).toLocaleTimeString("es-ES")}</td>
                <td>{s.end ? new Date(s.end).toLocaleTimeString("es-ES") : <span className="badge warn">abierto</span>}</td>
                <td>{s.breakMinutes} min</td>
                <td style={{ textAlign: "right" }}>{s.hours === null ? "—" : `${s.hours.toFixed(2)} h`}</td>
              </tr>
            ))}
            {shifts.length === 0 && (
              <tr><td colSpan={6} style={{ color: "#6b675c" }}>Sin fichajes este día.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
