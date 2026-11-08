import { prisma } from "@/lib/db";
import type { AccountType } from "@prisma/client";

export const SYSTEM_ACCOUNTS: Array<{ code: string; name: string; type: AccountType }> = [
  { code: "400", name: "Proveedores", type: "LIABILITY" },
  { code: "570", name: "Caja", type: "ASSET" },
  { code: "572", name: "Bancos c/c", type: "ASSET" },
  { code: "600", name: "Compras de mercaderías", type: "EXPENSE" },
  { code: "678", name: "Gastos excepcionales", type: "EXPENSE" },
  { code: "700", name: "Ventas de mercaderías", type: "INCOME" },
  { code: "705", name: "Prestación de servicios", type: "INCOME" },
  { code: "778", name: "Ingresos excepcionales", type: "INCOME" },
  { code: "472", name: "IVA soportado", type: "ASSET" },
  { code: "477", name: "IVA repercutido", type: "LIABILITY" },
];

export async function ensureSystemAccounts(establishmentId: string): Promise<void> {
  for (const account of SYSTEM_ACCOUNTS) {
    await prisma.ledgerAccount.upsert({
      where: { establishmentId_code: { establishmentId, code: account.code } },
      update: {},
      create: { establishmentId, ...account, isSystem: true },
    });
  }
}
