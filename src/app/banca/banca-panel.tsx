"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PaymentMethod } from "@prisma/client";
import {
  createAccountAction,
  importBankAction,
  paySupplierAction,
  reconcileAction,
} from "@/modules/bank/actions";

interface AccountDTO {
  id: string;
  name: string;
  iban: string | null;
}
interface MovementDTO {
  id: string;
  date: string;
  amount: number;
  description: string;
  reference: string | null;
  status: string;
  matchedSaleId: string | null;
  matchedSupplierPaymentId: string | null;
  account: string;
}
interface PaymentDTO {
  id: string;
  supplier: string;
  amount: number;
  method: string;
  paidAt: string;
  reference: string | null;
}
interface SupplierDTO {
  id: string;
  name: string;
}

const METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "CARD", label: "Transferencia/tarjeta" },
  { value: "BIZUM", label: "Bizum" },
  { value: "CASH", label: "Efectivo" },
  { value: "OTHER", label: "Otro" },
];

export default function BancaPanel(props: {
  accounts: AccountDTO[];
  movements: MovementDTO[];
  payments: PaymentDTO[];
  suppliers: SupplierDTO[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const [accName, setAccName] = useState("");
  const [accBank, setAccBank] = useState("");
  const [accIban, setAccIban] = useState("");
  const [importAccount, setImportAccount] = useState(props.accounts[0]?.id ?? "");
  const [importText, setImportText] = useState("");
  const [paySupplierId, setPaySupplierId] = useState(props.suppliers[0]?.id ?? "");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("CARD");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));

  function crearCuenta() {
    setMsg(null);
    startTransition(async () => {
      const r = await createAccountAction({ name: accName, bankName: accBank || undefined, iban: accIban || undefined });
      if (!r.ok) return setMsg({ kind: "error", text: r.message });
      setMsg({ kind: "ok", text: "Cuenta creada" });
      setAccName(""); setAccBank(""); setAccIban("");
      router.refresh();
    });
  }

  function importar() {
    setMsg(null);
    startTransition(async () => {
      const r = await importBankAction({ accountId: importAccount, text: importText });
      if (!r.ok) return setMsg({ kind: "error", text: r.message });
      setMsg({
        kind: "ok",
        text: `Importados ${r.imported}, omitidos ${r.skipped}; conciliación: ${r.reconcile.matched} cruzados, ${r.reconcile.pending} pendientes`,
      });
      router.refresh();
    });
  }

  function conciliar() {
    setMsg(null);
    startTransition(async () => {
      const r = await reconcileAction();
      if (!r.ok) return setMsg({ kind: "error", text: r.message });
      setMsg({ kind: "ok", text: `Cruzados ${r.matched}, pendientes ${r.pending}` });
      router.refresh();
    });
  }

  function pagar() {
    setMsg(null);
    startTransition(async () => {
      const r = await paySupplierAction({
        supplierId: paySupplierId,
        amount: Number(payAmount),
        method: payMethod,
        paidAt: payDate,
      });
      if (!r.ok) return setMsg({ kind: "error", text: r.message });
      setMsg({ kind: "ok", text: "Pago a proveedor registrado (asiento 400 → banco/caja)" });
      router.refresh();
    });
  }

  return (
    <>
      {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}

      <div className="grid2">
        <div className="card">
          <h2>Nueva cuenta bancaria</h2>
          <label>Nombre</label>
          <input value={accName} onChange={(e) => setAccName(e.target.value)} placeholder="Cuenta principal" />
          <label>Banco</label>
          <input value={accBank} onChange={(e) => setAccBank(e.target.value)} placeholder="Banco Santander" />
          <label>IBAN</label>
          <input value={accIban} onChange={(e) => setAccIban(e.target.value)} placeholder="ES00 0000 0000 0000 0000 0000" />
          <button onClick={crearCuenta} disabled={pending || !accName.trim()}>
            Crear cuenta
          </button>
        </div>
        <div className="card">
          <h2>Importar movimientos (CSV: fecha;importe;concepto;referencia)</h2>
          <label>Cuenta</label>
          <select value={importAccount} onChange={(e) => setImportAccount(e.target.value)}>
            {props.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} {a.iban ? `(${a.iban})` : ""}
              </option>
            ))}
          </select>
          <textarea
            rows={6}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            style={{ width: "100%", fontFamily: "ui-monospace, monospace", fontSize: 12, padding: 8, borderRadius: 8, border: "1px solid #cfcabb" }}
            placeholder={"fecha;importe;concepto;referencia\n12/03/2026;121,00;TPV BAR;REF001\n13/03/2026;-450,00;PAGO PROVEEDOR;REF002"}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={importar} disabled={pending || !importAccount || importText.length < 10}>
              Importar y conciliar
            </button>
            <button className="secondary" onClick={conciliar} disabled={pending}>
              Re-conciliar
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Registrar pago a proveedor</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
          <div>
            <label>Proveedor</label>
            <select value={paySupplierId} onChange={(e) => setPaySupplierId(e.target.value)}>
              {props.suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Importe</label>
            <input type="number" min="0" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} style={{ width: 110 }} />
          </div>
          <div>
            <label>Método</label>
            <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}>
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Fecha</label>
            <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
          </div>
          <button onClick={pagar} disabled={pending || !paySupplierId || !payAmount}>
            Registrar pago
          </button>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <h2>Movimientos bancarios ({props.movements.length})</h2>
          <table>
            <thead>
              <tr><th>Fecha</th><th>Concepto</th><th style={{ textAlign: "right" }}>Importe</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {props.movements.map((m) => (
                <tr key={m.id}>
                  <td>{m.date}</td>
                  <td>{m.description}</td>
                  <td style={{ textAlign: "right" }}>{m.amount.toFixed(2)} €</td>
                  <td>
                    {m.status === "MATCHED" ? (
                      <span className="badge ok">cruzado {m.matchedSaleId ? "(venta)" : "(pago proveedor)"}</span>
                    ) : (
                      <span className="badge warn">pendiente</span>
                    )}
                  </td>
                </tr>
              ))}
              {props.movements.length === 0 && (
                <tr><td colSpan={4} style={{ color: "#6b675c" }}>Sin movimientos. Crea una cuenta e importa un CSV.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2>Pagos a proveedores ({props.payments.length})</h2>
          <table>
            <thead>
              <tr><th>Fecha</th><th>Proveedor</th><th style={{ textAlign: "right" }}>Importe</th><th>Método</th></tr>
            </thead>
            <tbody>
              {props.payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.paidAt}</td>
                  <td>{p.supplier}</td>
                  <td style={{ textAlign: "right" }}>{p.amount.toFixed(2)} €</td>
                  <td>{p.method}</td>
                </tr>
              ))}
              {props.payments.length === 0 && (
                <tr><td colSpan={4} style={{ color: "#6b675c" }}>Sin pagos registrados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
