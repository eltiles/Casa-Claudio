import { prisma } from "@/lib/db";
import { sha256Hex } from "@/lib/hash";
import type { Establishment, Invoice, InvoiceLine, Prisma } from "@prisma/client";

export type InvoiceWithLines = Invoice & { lines: InvoiceLine[]; establishment: Establishment };

export function buildVerifactuAlta(inv: InvoiceWithLines): Record<string, unknown> {
  const est = inv.establishment;
  const dd = String(inv.issueDate.getUTCDate()).padStart(2, "0");
  const mm = String(inv.issueDate.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = inv.issueDate.getUTCFullYear();
  const baseByRate = (inv.baseByRate as Record<string, number>) ?? {};
  const taxByRate: Record<string, number> = {};
  for (const l of inv.lines) {
    const key = Number(l.taxRatePct).toFixed(4);
    taxByRate[key] = (taxByRate[key] ?? 0) + Number(l.taxAmount);
  }
  const desglose = Object.entries(baseByRate).map(([rate, base]) => ({
    TipoImpositivo: (Number(rate) * 100).toFixed(2),
    BaseImponible: Number(base).toFixed(2),
    CuotaRepercutida: (taxByRate[rate] ?? Number(base) * Number(rate)).toFixed(2),
  }));
  return {
    TipoRegistro: "ALTA",
    IDEmisorFactura: est.nif,
    NumSerieFactura: `${inv.seriesCode}-${inv.number}`,
    FechaExpedicionFactura: `${dd}/${mm}/${yyyy}`,
    TipoFactura: inv.kind === "COMPLETE" ? "F1" : inv.kind === "RECTIFICATIVE" ? "R1" : "F2",
    Desglose: desglose,
    ImporteTotal: Number(inv.total).toFixed(2),
    Encadenamiento:
      inv.previousHash && inv.previousHash.length > 0
        ? { RegistroAnterior: { HuellaAnterior: inv.previousHash } }
        : "N",
    Huella: inv.hash,
    FechaHoraHusoGenRegistro: inv.createdAt.toISOString(),
  };
}

export interface EinvoicingSender {
  name: string;
  send(record: Record<string, unknown>, invoice: InvoiceWithLines): Promise<{ ok: boolean; response?: string }>;
}

class RecordingSender implements EinvoicingSender {
  name = "registro local (sin VERIFACTU_ENDPOINT configurado; el envío real a la AEAT requiere certificado digital)";
  async send(): Promise<{ ok: boolean; response?: string }> {
    return { ok: true, response: "SIMULADO" };
  }
}

class HttpSender implements EinvoicingSender {
  name = "HTTP a VERIFACTU_ENDPOINT (certificado cliente requerido)";
  async send(record: Record<string, unknown>): Promise<{ ok: boolean; response?: string }> {
    const endpoint = process.env.VERIFACTU_ENDPOINT;
    if (!endpoint) return { ok: false, response: "VERIFACTU_ENDPOINT no configurado" };
    const body = `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><sum:RegFactuSistemaFacturacion xmlns:sum="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd">${JSON.stringify(record)}</sum:RegFactuSistemaFacturacion></soapenv:Body></soapenv:Envelope>`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "text/xml; charset=utf-8" },
      body,
    });
    return { ok: res.ok, response: `${res.status}` };
  }
}

export function getSender(): EinvoicingSender {
  return process.env.VERIFACTU_ENDPOINT ? new HttpSender() : new RecordingSender();
}

export async function isSiiRequired(establishmentId: string): Promise<boolean> {
  const UMBRAL_SII = 6010121.88;
  const yearAgo = new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const agg = await prisma.invoice.aggregate({
    where: { establishmentId, issueDate: { gte: yearAgo } },
    _sum: { total: true },
  });
  return Number(agg._sum.total ?? 0) > UMBRAL_SII;
}

export async function sendPending(establishmentId: string) {
  const pending = await prisma.invoice.findMany({
    where: {
      establishmentId,
      OR: [{ verifactuStatus: null }, { verifactuStatus: "PENDING" }, { verifactuStatus: "ERROR" }],
    },
    include: { lines: true, establishment: true },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  const sender = getSender();
  const ticketbai = process.env.TICKETBAI_ENABLED === "true";
  let sent = 0;
  const errors: string[] = [];
  for (const inv of pending) {
    const record = buildVerifactuAlta(inv);
    if (ticketbai) record.SistemaInformatico = { NombreRazon: inv.establishment.name, NIF: inv.establishment.nif, TicketBAI: true };
    const r = await sender.send(record, inv);
    await prisma.invoice.update({
      where: { id: inv.id },
      data: {
        verifactuStatus: r.ok ? "SENT" : "ERROR",
        verifactuRecord: record as Prisma.InputJsonValue,
        verifactuSentAt: r.ok ? new Date() : null,
      },
    });
    await prisma.auditLog.create({
      data: {
        action: "E-INVOICING_SEND",
        entityType: "invoice",
        entityId: inv.id,
        after: { status: r.ok ? "SENT" : "ERROR", sender: sender.name, response: r.response ?? null },
      },
    });
    if (r.ok) sent++;
    else errors.push(inv.id);
  }
  return {
    sent,
    errors,
    sender: sender.name,
    ticketbai,
    siiRequired: await isSiiRequired(establishmentId),
    encoding: sha256Hex("verifactu-v1").slice(0, 12),
  };
}

export async function einvoicingStatus(establishmentId: string) {
  const grouped = await prisma.invoice.groupBy({
    by: ["verifactuStatus"],
    where: { establishmentId },
    _count: true,
  });
  const byStatus: Record<string, number> = {};
  for (const g of grouped) byStatus[g.verifactuStatus ?? "PENDIENTE"] = g._count;
  return {
    byStatus,
    ticketbai: process.env.TICKETBAI_ENABLED === "true",
    endpointConfigured: Boolean(process.env.VERIFACTU_ENDPOINT),
    siiRequired: await isSiiRequired(establishmentId),
  };
}
