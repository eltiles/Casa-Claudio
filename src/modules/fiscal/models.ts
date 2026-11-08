import { prisma } from "@/lib/db";
import { round2 } from "@/lib/money";

export function quarterRange(year: number, quarter: number): { from: Date; to: Date } {
  const from = new Date(Date.UTC(year, (quarter - 1) * 3, 1));
  const to = new Date(Date.UTC(year, quarter * 3, 0, 23, 59, 59));
  return { from, to };
}

export async function modelo303(establishmentId: string, year: number, quarter: number) {
  const { from, to } = quarterRange(year, quarter);
  const invoices = await prisma.invoice.findMany({
    where: { establishmentId, issueDate: { gte: from, lte: to } },
  });
  const devengado: Record<string, { base: number; cuota: number }> = {};
  let totalDevengado = 0;
  for (const inv of invoices) {
    const sign = inv.kind === "RECTIFICATIVE" ? -1 : 1;
    const baseByRate = (inv.baseByRate as Record<string, number>) ?? {};
    for (const [rateStr, base] of Object.entries(baseByRate)) {
      const rate = Number(rateStr);
      const cuota = round2(Number(base) * rate);
      const cur = devengado[rateStr] ?? { base: 0, cuota: 0 };
      devengado[rateStr] = {
        base: round2(cur.base + sign * Number(base)),
        cuota: round2(cur.cuota + sign * cuota),
      };
      totalDevengado = round2(totalDevengado + sign * cuota);
    }
  }

  const purchases = await prisma.purchaseInvoice.findMany({
    where: { establishmentId, status: "POSTED", issueDate: { gte: from, lte: to } },
    include: { lines: true },
  });
  const deducido: Record<string, { base: number; cuota: number }> = {};
  let totalDeducible = 0;
  for (const p of purchases) {
    for (const l of p.lines) {
      const key = Number(l.taxRatePct).toFixed(4);
      const cur = deducido[key] ?? { base: 0, cuota: 0 };
      deducido[key] = {
        base: round2(cur.base + Number(l.baseAmount)),
        cuota: round2(cur.cuota + Number(l.taxAmount)),
      };
      totalDeducible = round2(totalDeducible + Number(l.taxAmount));
    }
  }

  return {
    modelo: "303",
    year,
    quarter,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    devengado: {
      porTipo: devengado,
      totalBase: round2(Object.values(devengado).reduce((s, b) => s + b.base, 0)),
      totalCuota: totalDevengado,
    },
    deducido: {
      porTipo: deducido,
      totalBase: round2(Object.values(deducido).reduce((s, b) => s + b.base, 0)),
      totalCuota: totalDeducible,
    },
    resultado: round2(totalDevengado - totalDeducible),
    nota: "Borrador para el asesor fiscal: casillas del modelo 303 (IVA devengado repercutido - IVA deducible soportado).",
  };
}

export async function modelo347(establishmentId: string, year: number) {
  const UMBRAL = 3005.06;
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year, 11, 31, 23, 59, 59));

  const purchases = await prisma.purchaseInvoice.findMany({
    where: { establishmentId, status: "POSTED", issueDate: { gte: from, lte: to } },
    include: { supplier: true },
  });
  const bySupplier = new Map<string, { nif: string | null; name: string; total: number }>();
  for (const p of purchases) {
    const cur = bySupplier.get(p.supplierId) ?? { nif: p.supplier.nif, name: p.supplier.name, total: 0 };
    cur.total = round2(cur.total + Number(p.total));
    bySupplier.set(p.supplierId, cur);
  }

  const invoices = await prisma.invoice.findMany({
    where: { establishmentId, issueDate: { gte: from, lte: to }, kind: "COMPLETE", customerNif: { not: null } },
  });
  const byCustomer = new Map<string, { nif: string; name: string | null; total: number }>();
  for (const inv of invoices) {
    const nif = inv.customerNif as string;
    const cur = byCustomer.get(nif) ?? { nif, name: inv.customerName, total: 0 };
    cur.total = round2(cur.total + Number(inv.total));
    byCustomer.set(nif, cur);
  }

  return {
    modelo: "347",
    year,
    umbral: UMBRAL,
    proveedores: [...bySupplier.values()].filter((x) => x.total > UMBRAL),
    clientes: [...byCustomer.values()].filter((x) => x.total > UMBRAL),
  };
}
