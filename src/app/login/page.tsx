"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      email: form.get("email"),
      password: form.get("password"),
      redirect: false,
    });
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
      <div className="card">
        <form onSubmit={onSubmit}>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="username" />
          <label htmlFor="password">Contraseña</label>
          <input id="password" name="password" type="password" required autoComplete="current-password" />
          {error && <div className="alert error">{error}</div>}
          <button type="submit" disabled={loading}>
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
