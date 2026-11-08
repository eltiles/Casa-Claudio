"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@prisma/client";
import { createUserAction, updateUserAction } from "@/modules/hr/actions";
import { disable2FAAction, enable2FAAction } from "@/modules/hr/actions2fa";

interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  hasPin: boolean;
  createdAt: string;
}

const ROLES: Array<{ value: Role; label: string }> = [
  { value: "ADMIN", label: "Admin" },
  { value: "MANAGER", label: "Encargado" },
  { value: "WAITER", label: "Camarero" },
  { value: "ACCOUNTANT", label: "Contable" },
];

export default function PersonalPanel({
  initialUsers,
  currentUserId,
}: {
  initialUsers: UserDTO[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "WAITER" as Role, pin: "" });
  const [pinFor, setPinFor] = useState<Record<string, string>>({});

  function crear() {
    setMsg(null);
    startTransition(async () => {
      const r = await createUserAction({
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        pin: form.pin || undefined,
      });
      if (!r.ok) return setMsg({ kind: "error", text: r.message });
      setMsg({ kind: "ok", text: `Usuario ${r.email} creado` });
      setForm({ name: "", email: "", password: "", role: "WAITER", pin: "" });
      router.refresh();
    });
  }

  const [totp, setTotp] = useState<{ secret: string; otpauth: string } | null>(null);

  function activar2FA() {
    startTransition(async () => {
      const r = await enable2FAAction();
      if (!r.ok) return setMsg({ kind: "error", text: r.message });
      setTotp({ secret: r.secret, otpauth: r.otpauth });
      setMsg({ kind: "ok", text: "2FA activado: añade la cuenta en tu app autenticadora y verifica el código en el login" });
    });
  }

  function desactivar2FA() {
    startTransition(async () => {
      const r = await disable2FAAction();
      if (!r.ok) return setMsg({ kind: "error", text: r.message });
      setTotp(null);
      setMsg({ kind: "ok", text: "2FA desactivado" });
    });
  }

  function actualizar(id: string, patch: { role?: Role; active?: boolean; pin?: string }) {
    setMsg(null);
    startTransition(async () => {
      const r = await updateUserAction({ id, ...patch });
      if (!r.ok) return setMsg({ kind: "error", text: r.message });
      setPinFor((p) => ({ ...p, [id]: "" }));
      setMsg({ kind: "ok", text: "Usuario actualizado" });
      router.refresh();
    });
  }

  return (
    <>
      {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}
      <div className="card" style={{ maxWidth: 560 }}>
        <h2>Mi 2FA (TOTP)</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="secondary" onClick={activar2FA} disabled={pending}>Activar 2FA</button>
          <button className="secondary" onClick={desactivar2FA} disabled={pending}>Desactivar 2FA</button>
        </div>
        {totp && (
          <p style={{ fontSize: 13, marginTop: 8 }}>
            Secreto: <code className="mono">{totp.secret}</code>
            <br />
            URL: <code className="mono">{totp.otpauth}</code>
          </p>
        )}
      </div>
      <div className="card" style={{ maxWidth: 560 }}>
        <h2>Nuevo usuario</h2>
        <div className="grid2">
          <div>
            <label>Nombre</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label>Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
        </div>
        <div className="grid2">
          <div>
            <label>Contraseña</label>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div>
            <label>PIN TPV (opcional, 4-6 dígitos)</label>
            <input inputMode="numeric" pattern="[0-9]{4,6}" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} />
          </div>
        </div>
        <label>Rol</label>
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        <button onClick={crear} disabled={pending || !form.name || !form.email || !form.password}>
          Crear usuario
        </button>
      </div>

      <div className="card">
        <h2>Usuarios ({initialUsers.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Rol</th>
              <th>PIN</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {initialUsers.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td className="mono">{u.email}</td>
                <td>
                  <select
                    value={u.role}
                    disabled={u.id === currentUserId || pending}
                    onChange={(e) => actualizar(u.id, { role: e.target.value as Role })}
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </td>
                <td>{u.hasPin ? "sí" : "no"}</td>
                <td>
                  {u.active ? <span className="badge ok">activo</span> : <span className="badge bad">baja</span>}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <input
                    placeholder="nuevo PIN"
                    inputMode="numeric"
                    value={pinFor[u.id] ?? ""}
                    onChange={(e) => setPinFor((p) => ({ ...p, [u.id]: e.target.value }))}
                    style={{ width: 80, display: "inline-block", marginBottom: 0, marginRight: 6 }}
                    disabled={u.id === currentUserId || pending}
                  />
                  <button
                    className="mini"
                    disabled={u.id === currentUserId || pending || !(pinFor[u.id] ?? "")}
                    onClick={() => actualizar(u.id, { pin: pinFor[u.id] })}
                  >
                    Reset PIN
                  </button>{" "}
                  {u.id !== currentUserId && (
                    <button
                      className="mini"
                      disabled={pending}
                      onClick={() => actualizar(u.id, { active: !u.active })}
                    >
                      {u.active ? "Dar de baja" : "Reactivar"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
