import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();

function pinLookup(pin: string): string {
  return crypto.createHash("sha256").update(pin, "utf8").digest("hex");
}

async function main() {
  const establishment = await prisma.establishment.upsert({
    where: { nif: "B12345678" },
    update: {},
    create: {
      name: "Bar Ejemplo",
      nif: "B12345678",
      address: "Calle Mayor 1",
      postalCode: "28001",
      municipality: "Madrid",
      province: "Madrid",
    },
  });

  const passwordHash = await bcrypt.hash("admin1234", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@bar.local" },
    update: {
      pinHash: await bcrypt.hash("1234", 10),
      pinLookup: pinLookup("1234"),
    },
    create: {
      establishmentId: establishment.id,
      email: "admin@bar.local",
      name: "Administrador",
      passwordHash,
      pinHash: await bcrypt.hash("1234", 10),
      pinLookup: pinLookup("1234"),
      role: "ADMIN",
    },
  });

  await prisma.user.upsert({
    where: { email: "camarero@bar.local" },
    update: {
      pinHash: await bcrypt.hash("4321", 10),
      pinLookup: pinLookup("4321"),
    },
    create: {
      establishmentId: establishment.id,
      email: "camarero@bar.local",
      name: "Camarero Ejemplo",
      passwordHash: await bcrypt.hash("camarero1234", 10),
      pinHash: await bcrypt.hash("4321", 10),
      pinLookup: pinLookup("4321"),
      role: "WAITER",
    },
  });

  const validFrom = new Date("2024-01-01T00:00:00Z");
  const taxRatesData = [
    { code: "IVA_GENERAL_21", label: "IVA general 21% (bebidas alcohólicas, espectáculos, otros)", rate: 0.21 },
    { code: "IVA_REDUCIDO_10", label: "IVA reducido 10% (alimentos y bebidas sin alcohol en hostelería)", rate: 0.1 },
    { code: "IVA_SUPERREDUCIDO_4", label: "IVA superreducido 4% (bienes de primera necesidad)", rate: 0.04 },
    { code: "IVA_EXENTO_0", label: "IVA exento 0%", rate: 0.0 },
  ];
  const taxRates: Record<string, string> = {};
  for (const t of taxRatesData) {
    const rate = await prisma.taxRate.upsert({
      where: { code_validFrom: { code: t.code, validFrom } },
      update: { label: t.label, rate: t.rate, active: true },
      create: { code: t.code, label: t.label, rate: t.rate, validFrom, active: true },
    });
    taxRates[t.code] = rate.id;
  }

  const accounts = [
    { code: "400", name: "Proveedores", type: "LIABILITY" as const },
    { code: "570", name: "Caja", type: "ASSET" as const },
    { code: "572", name: "Bancos c/c", type: "ASSET" as const },
    { code: "600", name: "Compras de mercaderías", type: "EXPENSE" as const },
    { code: "678", name: "Gastos excepcionales", type: "EXPENSE" as const },
    { code: "700", name: "Ventas de mercaderías", type: "INCOME" as const },
    { code: "705", name: "Prestación de servicios", type: "INCOME" as const },
    { code: "778", name: "Ingresos excepcionales", type: "INCOME" as const },
    { code: "472", name: "IVA soportado", type: "ASSET" as const },
    { code: "477", name: "IVA repercutido", type: "LIABILITY" as const },
  ];
  for (const a of accounts) {
    await prisma.ledgerAccount.upsert({
      where: { establishmentId_code: { establishmentId: establishment.id, code: a.code } },
      update: {},
      create: { establishmentId: establishment.id, ...a, isSystem: true },
    });
  }

  const year = new Date().getFullYear();
  await prisma.invoiceSeries.upsert({
    where: { establishmentId_code_year: { establishmentId: establishment.id, code: "A", year } },
    update: {},
    create: { establishmentId: establishment.id, code: "A", description: "Serie principal", year, nextNumber: 1 },
  });

  const categories: Record<string, string> = {};
  for (const [key, name] of [
    ["BEBIDAS", "Bebidas"],
    ["COMIDA", "Comida"],
    ["CAFE", "Cafés"],
  ] as const) {
    const c = await prisma.category.upsert({
      where: { id: `${establishment.id}-${key}` },
      update: { name },
      create: { id: `${establishment.id}-${key}`, establishmentId: establishment.id, name },
    });
    categories[key] = c.id;
  }

  const products = [
    { sku: "CERVEZA", name: "Caña de cerveza", category: "BEBIDAS", taxRate: "IVA_GENERAL_21", price: 2.5, costStd: 0.9 },
    { sku: "REFRESCO", name: "Refresco", category: "BEBIDAS", taxRate: "IVA_REDUCIDO_10", price: 2.2, costStd: 0.5 },
    { sku: "BRAVAS", name: "Ración de bravas", category: "COMIDA", taxRate: "IVA_REDUCIDO_10", price: 8.0, costStd: 2.4 },
    { sku: "CAFE", name: "Café solo", category: "CAFE", taxRate: "IVA_REDUCIDO_10", price: 1.8, costStd: 0.25 },
  ];
  for (const p of products) {
    await prisma.product.upsert({
      where: { establishmentId_sku: { establishmentId: establishment.id, sku: p.sku } },
      update: { name: p.name, price: p.price, costStd: p.costStd, taxRateId: taxRates[p.taxRate] },
      create: {
        establishmentId: establishment.id,
        categoryId: categories[p.category],
        sku: p.sku,
        name: p.name,
        taxRateId: taxRates[p.taxRate],
        price: p.price,
        costStd: p.costStd,
        saleAccountCode: "700",
      },
    });
  }

  for (let i = 1; i <= 8; i++) {
    await prisma.diningTable.upsert({
      where: { id: `${establishment.id}-M${i}` },
      update: {},
      create: { id: `${establishment.id}-M${i}`, establishmentId: establishment.id, name: `Mesa ${i}`, capacity: 4 },
    });
  }

  await prisma.supplier.upsert({
    where: { id: `${establishment.id}-PROV-BEBIDAS` },
    update: {},
    create: {
      id: `${establishment.id}-PROV-BEBIDAS`,
      establishmentId: establishment.id,
      name: "Distribuidora Bebidas SA",
      nif: "B87654321",
    },
  });

  const stockData = [
    { sku: "CERVEZA-L", name: "Cerveza (barril)", unit: "l", quantity: 40, minStock: 10, unitCost: 1.1 },
    { sku: "REFRESCO-LATA", name: "Refresco lata", unit: "unidad", quantity: 48, minStock: 12, unitCost: 0.45 },
    { sku: "PATATAS-KG", name: "Patatas", unit: "kg", quantity: 10, minStock: 3, unitCost: 1.2 },
    { sku: "HUEVOS", name: "Huevos", unit: "unidad", quantity: 60, minStock: 20, unitCost: 0.18 },
    { sku: "ACEITE-L", name: "Aceite de oliva", unit: "l", quantity: 5, minStock: 1.5, unitCost: 6.5 },
    { sku: "CAFE-KG", name: "Café molido", unit: "kg", quantity: 4, minStock: 1, unitCost: 9.0 },
  ];
  const stockBySku: Record<string, string> = {};
  for (const s of stockData) {
    const item = await prisma.stockItem.upsert({
      where: { establishmentId_sku: { establishmentId: establishment.id, sku: s.sku } },
      update: { name: s.name, unit: s.unit, minStock: s.minStock },
      create: { establishmentId: establishment.id, ...s },
    });
    stockBySku[s.sku] = item.id;
  }

  const recipes: Record<string, Array<[string, number]>> = {
    CERVEZA: [["CERVEZA-L", 0.25]],
    REFRESCO: [["REFRESCO-LATA", 1]],
    BRAVAS: [["PATATAS-KG", 0.35], ["HUEVOS", 2], ["ACEITE-L", 0.03]],
    CAFE: [["CAFE-KG", 0.008]],
  };
  for (const [productSku, recipeLines] of Object.entries(recipes)) {
    const product = await prisma.product.findUnique({
      where: { establishmentId_sku: { establishmentId: establishment.id, sku: productSku } },
    });
    if (!product) continue;
    const recipe = await prisma.recipe.upsert({
      where: { productId: product.id },
      update: {},
      create: { productId: product.id },
    });
    await prisma.recipeLine.deleteMany({ where: { recipeId: recipe.id } });
    let cost = 0;
    for (const [stockSku, qty] of recipeLines) {
      await prisma.recipeLine.create({
        data: { recipeId: recipe.id, stockItemId: stockBySku[stockSku], quantity: qty },
      });
      const item = stockData.find((x) => x.sku === stockSku);
      cost += qty * (item?.unitCost ?? 0);
    }
    await prisma.product.update({
      where: { id: product.id },
      data: { costStd: Math.round(cost * 100) / 100 },
    });
  }

  console.log(
    `Seed OK — establecimiento=${establishment.name}, admin=${admin.email} (admin1234, PIN 1234), camarero@bar.local (camarero1234, PIN 4321)`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
