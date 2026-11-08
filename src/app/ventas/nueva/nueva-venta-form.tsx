"use client";

import { useActionState } from "react";
import { createSaleAction, type CreateSaleActionResult } from "@/modules/sales/actions";

interface ProductOption {
  id: string;
  name: string;
  price: number;
  taxPct: number;
}

const initialState: CreateSaleActionResult = { ok: false, error: "", message: "" };

export default function NuevaVentaForm({ products }: { products: ProductOption[] }) {
  const [state, formAction, pending] = useActionState<CreateSaleActionResult, FormData>(
    async (_prev, formData) => createSaleAction(formData),
    initialState
  );

  return (
    <form action={formAction}>
      <label htmlFor="productId">Producto</label>
      <select id="productId" name="productId" required defaultValue={products[0]?.id ?? ""}>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} — {p.price.toFixed(2)} € (IVA {p.taxPct}%)
          </option>
        ))}
      </select>

      <label htmlFor="quantity">Cantidad</label>
      <input id="quantity" name="quantity" type="number" min={1} step={1} defaultValue={1} required />

      <label htmlFor="method">Método de pago</label>
      <select id="method" name="method" defaultValue="CASH">
        <option value="CASH">Efectivo</option>
        <option value="CARD">Tarjeta</option>
        <option value="CONTACTLESS">Contactless</option>
        <option value="BIZUM">Bizum</option>
        <option value="OTHER">Otro</option>
      </select>

      {state.ok && (
        <div className="alert ok">
          Venta {state.number} registrada — total {state.total.toFixed(2)} €
        </div>
      )}
      {!state.ok && state.error && <div className="alert error">{state.message}</div>}

      <button type="submit" disabled={pending || products.length === 0}>
        {pending ? "Cobrando…" : "Cobrar"}
      </button>
    </form>
  );
}
