import crypto from "crypto";

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

export interface InvoiceHashInput {
  establishmentId: string;
  seriesCode: string;
  number: number;
  kind: string;
  issueDateIso: string;
  customerNif: string;
  lines: Array<{
    description: string;
    quantity: string;
    unitPrice: string;
    taxRatePct: string;
    baseAmount: string;
    taxAmount: string;
    totalAmount: string;
  }>;
  totalBase: string;
  totalTax: string;
  total: string;
  previousHash: string;
}

export function invoiceHashPayload(input: InvoiceHashInput): string {
  const lines = input.lines
    .map(
      (l) =>
        [l.description, l.quantity, l.unitPrice, l.taxRatePct, l.baseAmount, l.taxAmount, l.totalAmount].join("|")
    )
    .join(";");
  return [
    input.establishmentId,
    input.seriesCode,
    String(input.number),
    input.kind,
    input.issueDateIso,
    input.customerNif,
    lines,
    input.totalBase,
    input.totalTax,
    input.total,
    input.previousHash,
  ].join("§");
}

export function invoiceHash(input: InvoiceHashInput): string {
  return sha256Hex(invoiceHashPayload(input));
}
