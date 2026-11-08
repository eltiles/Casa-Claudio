export interface EscPosTicket {
  establishmentName: string;
  nif: string;
  address: string;
  series: string;
  number: number;
  date: string;
  lines: Array<{ description: string; quantity: number; total: string }>;
  base: string;
  tax: string;
  total: string;
  hash: string;
}

function enc(s: string): Buffer {
  return Buffer.from(s, "latin1");
}

export function buildTicketEscPos(t: EscPosTicket): Buffer {
  const parts: Buffer[] = [];
  parts.push(Buffer.from([0x1b, 0x40]));
  parts.push(Buffer.from([0x1b, 0x61, 0x01]));
  parts.push(enc(`${t.establishmentName}\n`));
  parts.push(enc(`NIF ${t.nif}\n${t.address}\n`));
  parts.push(enc(`Ticket ${t.series}-${t.number}\n${t.date}\n`));
  parts.push(Buffer.from([0x1b, 0x61, 0x00]));
  parts.push(enc("--------------------------------\n"));
  for (const l of t.lines) {
    parts.push(enc(`${l.quantity}x ${l.description}  ${l.total}\n`));
  }
  parts.push(enc("--------------------------------\n"));
  parts.push(enc(`Base ${t.base}  IVA ${t.tax}\n`));
  parts.push(enc(`TOTAL ${t.total}\n`));
  parts.push(Buffer.from([0x1b, 0x61, 0x01]));
  parts.push(enc(`Hash ${t.hash.slice(0, 32)}\n`));
  parts.push(Buffer.from([0x1d, 0x56, 0x41, 0x03]));
  return Buffer.concat(parts);
}
