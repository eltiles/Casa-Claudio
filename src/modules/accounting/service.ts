import { prisma } from "@/lib/db";
import { round2 } from "@/lib/money";

export async function listLedgerEntries(establishmentId: string, from?: Date, to?: Date, limit = 100) {
  const entries = await prisma.ledgerEntry.findMany({
    where: {
      establishmentId,
      ...(from && to ? { date: { gte: from, lte: to } } : {}),
    },
    orderBy: [{ date: "desc" }, { number: "desc" }],
    take: Math.min(limit, 500),
    include: { lines: { include: { account: true } } },
  });
  return entries.map((e) => ({
    id: e.id,
    number: e.number,
    date: e.date.toISOString().slice(0, 10),
    description: e.description,
    source: e.source,
    balanced: round2(e.lines.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0)) === 0,
    lines: e.lines.map((l) => ({
      account: l.account.code,
      name: l.account.name,
      debit: Number(l.debit),
      credit: Number(l.credit),
      description: l.description,
    })),
  }));
}

export interface ReportSummary {
  from: string;
  to: string;
  ingresos: number;
  gastos: number;
  compras: number;
  ivaRepercutido: number;
  ivaSoportado: number;
  ivaResultado: number;
  beneficio: number;
  cobrosPorMetodo: Record<string, number>;
  totalCobros: number;
  pagosProveedores: number;
  cashFlow: number;
  porDia: Array<{ dia: string; ventas: number; cobros: number }>;
  cierres: Array<{ date: string; difference: number | null; status: string }>;
}

export async function buildReportSummary(
  establishmentId: string,
  from: Date,
  to: Date
): Promise<ReportSummary> {
  const entries = await prisma.ledgerEntry.findMany({
    where: { establishmentId, date: { gte: from, lte: to } },
    include: { lines: { include: { account: true } } },
  });
  let ingresos = 0;
  let gastos = 0;
  let compras = 0;
  let ivaRep = 0;
  let ivaSop = 0;
  for (const e of entries) {
    for (const l of e.lines) {
      const d = Number(l.debit);
      const c = Number(l.credit);
      if (l.account.type === "INCOME") ingresos = round2(ingresos + (c - d));
      if (l.account.type === "EXPENSE") gastos = round2(gastos + (d - c));
      if (l.account.code === "600") compras = round2(compras + d);
      if (l.account.code === "477") ivaRep = round2(ivaRep + c);
      if (l.account.code === "472") ivaSop = round2(ivaSop + d);
    }
  }

  const sales = await prisma.sale.findMany({
    where: { establishmentId, status: "PAID", closedAt: { gte: from, lte: to } },
    include: { payments: true },
  });
  const cobrosPorMetodo: Record<string, number> = {};
  let totalCobros = 0;
  const porDiaMap = new Map<string, { ventas: number; cobros: number }>();
  for (const s of sales) {
    const total = Number(s.total);
    totalCobros = round2(totalCobros + total);
    const dia = (s.closedAt ?? s.createdAt).toISOString().slice(0, 10);
    const d = porDiaMap.get(dia) ?? { ventas: 0, cobros: 0 };
    d.ventas = round2(d.ventas + total);
    for (const p of s.payments) {
      cobrosPorMetodo[p.method] = round2((cobrosPorMetodo[p.method] ?? 0) + Number(p.amount));
      d.cobros = round2(d.cobros + Number(p.amount));
    }
    porDiaMap.set(dia, d);
  }

  const supplierPayments = await prisma.supplierPayment.findMany({
    where: { establishmentId, paidAt: { gte: from, lte: to } },
  });
  const pagosProveedores = round2(supplierPayments.reduce((s, p) => s + Number(p.amount), 0));

  const cierres = await prisma.cashClosing.findMany({
    where: { establishmentId, date: { gte: from, lte: to } },
    orderBy: { date: "asc" },
  });

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    ingresos,
    gastos,
    compras,
    ivaRepercutido: ivaRep,
    ivaSoportado: ivaSop,
    ivaResultado: round2(ivaRep - ivaSop),
    beneficio: round2(ingresos - gastos),
    cobrosPorMetodo,
    totalCobros,
    pagosProveedores,
    cashFlow: round2(totalCobros - pagosProveedores),
    porDia: [...porDiaMap.entries()]
      .map(([dia, v]) => ({ dia, ...v }))
      .sort((a, b) => a.dia.localeCompare(b.dia)),
    cierres: cierres.map((c) => ({
      date: c.date.toISOString().slice(0, 10),
      difference: c.difference === null ? null : Number(c.difference),
      status: c.status,
    })),
  };
}
