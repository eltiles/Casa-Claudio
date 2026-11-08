import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { round2 } from "@/lib/money";
import { FiscalError } from "@/lib/errors";
import { sha256Hex } from "@/lib/hash";
import type { Role } from "@prisma/client";

export async function clockIn(establishmentId: string, userId: string) {
  const open = await prisma.shift.findFirst({ where: { userId, end: null } });
  if (open) return { shift: open, alreadyOpen: true as const };
  const shift = await prisma.shift.create({
    data: { establishmentId, userId, start: new Date() },
  });
  await prisma.auditLog.create({
    data: { actorId: userId, action: "CLOCK_IN", entityType: "shift", entityId: shift.id },
  });
  return { shift, alreadyOpen: false as const };
}

export async function clockOut(establishmentId: string, userId: string) {
  const open = await prisma.shift.findFirst({ where: { userId, end: null } });
  if (!open) throw new FiscalError("NO_OPEN_SHIFT", "No hay ningún fichaje abierto");
  const shift = await prisma.shift.update({ where: { id: open.id }, data: { end: new Date() } });
  await prisma.auditLog.create({
    data: { actorId: userId, action: "CLOCK_OUT", entityType: "shift", entityId: shift.id },
  });
  return { shift };
}

export function shiftHours(shift: { start: Date; end: Date | null; breakMinutes: number }): number | null {
  if (!shift.end) return null;
  return round2((shift.end.getTime() - shift.start.getTime()) / 3600000 - shift.breakMinutes / 60);
}

export async function listShifts(establishmentId: string, date?: string) {
  const day = date ? new Date(`${date}T00:00:00`) : new Date();
  day.setHours(0, 0, 0, 0);
  const dayEnd = new Date(day);
  dayEnd.setHours(23, 59, 59, 999);
  const [dayShifts, openShifts] = await Promise.all([
    prisma.shift.findMany({
      where: { establishmentId, start: { gte: day, lte: dayEnd } },
      include: { user: true },
      orderBy: { start: "desc" },
    }),
    prisma.shift.findMany({
      where: { establishmentId, end: null },
      include: { user: true },
    }),
  ]);
  const all = [...dayShifts, ...openShifts.filter((o) => !dayShifts.some((s) => s.id === o.id))];
  return all
    .map((s) => ({
      id: s.id,
      user: s.user.name,
      email: s.user.email,
      role: s.user.role,
      start: s.start.toISOString(),
      end: s.end ? s.end.toISOString() : null,
      breakMinutes: s.breakMinutes,
      hours: shiftHours(s),
    }))
    .sort((a, b) => b.start.localeCompare(a.start));
}

export async function listUsers(establishmentId: string) {
  const users = await prisma.user.findMany({
    where: { establishmentId },
    orderBy: { name: "asc" },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    hasPin: Boolean(u.pinHash),
    createdAt: u.createdAt.toISOString().slice(0, 10),
  }));
}

export async function createUser(input: {
  establishmentId: string;
  name: string;
  email: string;
  password: string;
  role: Role;
  pin?: string;
  actorId?: string | null;
}) {
  const email = input.email.toLowerCase().trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    throw new FiscalError("INVALID_EMAIL", "Email no válido");
  if (input.password.length < 6)
    throw new FiscalError("WEAK_PASSWORD", "La contraseña debe tener al menos 6 caracteres");
  if (input.pin && !/^\d{4,6}$/.test(input.pin))
    throw new FiscalError("INVALID_PIN", "El PIN debe tener 4-6 dígitos");
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new FiscalError("DUPLICATE_EMAIL", `Ya existe un usuario con ${email}`);

  const user = await prisma.user.create({
    data: {
      establishmentId: input.establishmentId,
      name: input.name.trim(),
      email,
      passwordHash: await bcrypt.hash(input.password, 10),
      pinHash: input.pin ? await bcrypt.hash(input.pin, 10) : null,
      pinLookup: input.pin ? sha256Hex(input.pin) : null,
      role: input.role,
      active: true,
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      action: "CREATE_USER",
      entityType: "user",
      entityId: user.id,
      after: { email, role: input.role, pinSet: Boolean(input.pin) },
    },
  });
  return { id: user.id, email: user.email };
}

export async function updateUser(input: {
  establishmentId: string;
  id: string;
  role?: Role;
  active?: boolean;
  pin?: string;
  actorId?: string | null;
}) {
  const user = await prisma.user.findFirst({
    where: { id: input.id, establishmentId: input.establishmentId },
  });
  if (!user) throw new FiscalError("USER_NOT_FOUND", "Usuario no encontrado");
  if (input.pin && !/^\d{4,6}$/.test(input.pin))
    throw new FiscalError("INVALID_PIN", "El PIN debe tener 4-6 dígitos");

  const user2 = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(input.role ? { role: input.role } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.pin
        ? { pinHash: await bcrypt.hash(input.pin, 10), pinLookup: sha256Hex(input.pin) }
        : {}),
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      action: "UPDATE_USER",
      entityType: "user",
      entityId: user.id,
      after: {
        role: input.role ?? user.role,
        active: input.active ?? user.active,
        pinReset: Boolean(input.pin),
      },
    },
  });
  return { id: user2.id, role: user2.role, active: user2.active, hasPin: Boolean(user2.pinHash) };
}

export interface CommissionRow {
  waiterId: string;
  waiter: string;
  sales: number;
  total: number;
  base: number;
  commission: number;
}

export async function commissionsReport(
  establishmentId: string,
  from: Date,
  to: Date
): Promise<CommissionRow[]> {
  const sales = await prisma.sale.findMany({
    where: { establishmentId, status: "PAID", closedAt: { gte: from, lte: to }, waiterId: { not: null } },
    include: {
      waiter: true,
      lines: { include: { product: { include: { category: true } } } },
    },
  });
  const byWaiter = new Map<string, CommissionRow>();
  for (const s of sales) {
    const waiterId = s.waiterId as string;
    const cur = byWaiter.get(waiterId) ?? {
      waiterId,
      waiter: s.waiter?.name ?? "—",
      sales: 0,
      total: 0,
      base: 0,
      commission: 0,
    };
    cur.sales++;
    cur.total = round2(cur.total + Number(s.total));
    for (const l of s.lines) {
      const base = Number(l.baseAmount);
      cur.base = round2(cur.base + base);
      const pct = Number(l.product.category.commissionPct ?? 0);
      cur.commission = round2(cur.commission + base * (pct / 100));
    }
    byWaiter.set(waiterId, cur);
  }
  return [...byWaiter.values()].sort((a, b) => b.commission - a.commission);
}
