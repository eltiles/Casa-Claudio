"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"pass" | "pin">("pass");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res =
      mode === "pass"
        ? await signIn("credentials", {
            email: form.get("email"),
            password: form.get("password"),
            redirect: false,
          })
        : await signIn("pin", { pin: form.get("pin"), redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("Credenciales no válidas");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 380 }}>
      <h1>Gestión Bar — Acceso</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button className={mode === "pass" ? "cat active" : "cat"} onClick={() => setMode("pass")} type="button">
          Email y contraseña
        </button>
        <button className={mode === "pin" ? "cat active" : "cat"} onClick={() => setMode("pin")} type="button">
          PIN (TPV)
        </button>
      </div>
      <div className="card">
        <form onSubmit={onSubmit}>
          {mode === "pass" ? (
            <>
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" required autoComplete="username" />
              <label htmlFor="password">Contraseña</label>
              <input id="password" name="password" type="password" required autoComplete="current-password" />
            </>
          ) : (
            <>
              <label htmlFor="pin">PIN de camarero (4-6 dígitos)</label>
              <input
                id="pin"
                name="pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4,6}"
                required
                autoComplete="off"
              />
            </>
          )}
          {error && <div className="alert error">{error}</div>}
          <button type="submit" disabled={loading}>
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
