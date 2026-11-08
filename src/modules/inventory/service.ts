import { prisma } from "@/lib/db";
import { round2 } from "@/lib/money";
import { FiscalError } from "@/lib/errors";
import type { Prisma } from "@prisma/client";
import { nextLedgerEntryNumber } from "@/modules/accounting/ledger";

export interface PurchaseLineInput {
  stockItemId: string;
  description: string;
  quantity: number;
  unitCost: number;
  taxRatePct: number;
}

export interface CreatePurchaseInput {
  establishmentId: string;
  supplierId: string;
  number: string;
  issueDate: string;
  lines: PurchaseLineInput[];
  actorId?: string | null;
}

export async function recomputeProductCost(tx: Prisma.TransactionClient, productId: string): Promise<number> {
  const recipe = await tx.recipe.findUnique({
    where: { productId },
    include: { lines: { include: { stockItem: true } } },
  });
  if (!recipe) {
    await tx.product.update({ where: { id: productId }, data: { costStd: 0 } });
    return 0;
  }
  const cost = round2(
    recipe.lines.reduce((s, l) => s + Number(l.quantity) * Number(l.stockItem.unitCost), 0)
  );
  await tx.product.update({ where: { id: productId }, data: { costStd: cost } });
  return cost;
}

async function recomputeCostsForStockItem(tx: Prisma.TransactionClient, stockItemId: string): Promise<void> {
  const recipeLines = await tx.recipeLine.findMany({
    where: { stockItemId },
    select: { recipe: { select: { productId: true } } },
  });
  for (const rl of recipeLines) {
    await recomputeProductCost(tx, rl.recipe.productId);
  }
}

export async function createPurchaseInvoice(input: CreatePurchaseInput) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.issueDate))
    throw new FiscalError("INVALID_DATE", "La fecha debe tener formato YYYY-MM-DD");
  if (!input.lines.length) throw new FiscalError("EMPTY_PURCHASE", "La factura de compra no tiene líneas");
  for (const l of input.lines) {
    if (l.quantity <= 0) throw new FiscalError("INVALID_QUANTITY", "La cantidad debe ser positiva");
    if (l.unitCost < 0) throw new FiscalError("INVALID_COST", "El coste no puede ser negativo");
  }

  const supplier = await prisma.supplier.findFirst({
    where: { id: input.supplierId, establishmentId: input.establishmentId },
  });
  if (!supplier) throw new FiscalError("SUPPLIER_NOT_FOUND", "Proveedor no encontrado");

  const lines = input.lines.map((l) => {
    const base = round2(l.quantity * l.unitCost);
    const tax = round2(base * l.taxRatePct);
    return { ...l, baseAmount: base, taxAmount: tax };
  });
  const totalBase = round2(lines.reduce((s, l) => s + l.baseAmount, 0));
  const totalTax = round2(lines.reduce((s, l) => s + l.taxAmount, 0));
  const total = round2(totalBase + totalTax);
  const issueDate = new Date(`${input.issueDate}T00:00:00`);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.purchaseInvoice.findUnique({
      where: { supplierId_number: { supplierId: supplier.id, number: input.number } },
    });
    if (existing)
      throw new FiscalError("DUPLICATE_PURCHASE", `Ya existe la factura ${input.number} de este proveedor`);

    const invoice = await tx.purchaseInvoice.create({
      data: {
        establishmentId: input.establishmentId,
        supplierId: supplier.id,
        number: input.number,
        issueDate,
        totalBase,
        totalTax,
        total,
        status: "POSTED",
        lines: {
          create: lines.map((l) => ({
            stockItem: { connect: { id: l.stockItemId } },
            description: l.description,
            quantity: l.quantity,
            unitCost: l.unitCost,
            taxRatePct: l.taxRatePct,
            baseAmount: l.baseAmount,
            taxAmount: l.taxAmount,
          })),
        },
      },
      include: { lines: true },
    });

    for (const l of invoice.lines) {
      const stockItemId = l.stockItemId;
      if (!stockItemId) continue;
      const ref = `PO:${invoice.id}:${stockItemId}`;
      const already = await tx.stockMovement.findFirst({ where: { reference: ref } });
      if (!already) {
        await tx.stockMovement.create({
          data: {
            stockItem: { connect: { id: stockItemId } },
            type: "IN",
            quantity: Number(l.quantity),
            reference: ref,
          },
        });
      }
      await tx.stockItem.update({
        where: { id: stockItemId },
        data: { quantity: { increment: Number(l.quantity) }, unitCost: l.unitCost },
      });
      await recomputeCostsForStockItem(tx, stockItemId);
    }

    const entryNumber = await nextLedgerEntryNumber(tx, input.establishmentId);
    await tx.ledgerEntry.create({
      data: {
        establishmentId: input.establishmentId,
        number: entryNumber,
        date: issueDate,
        description: `Compra ${supplier.name} factura ${input.number}`,
        source: "PURCHASE",
        sourceId: invoice.id,
        postedById: input.actorId ?? null,
        lines: {
          create: [
            {
              account: { connect: { establishmentId_code: { establishmentId: input.establishmentId, code: "600" } } },
              debit: totalBase,
              credit: 0,
              description: `Compras factura ${input.number}`,
            },
            {
              account: { connect: { establishmentId_code: { establishmentId: input.establishmentId, code: "472" } } },
              debit: totalTax,
              credit: 0,
              description: `IVA soportado factura ${input.number}`,
            },
            {
              account: { connect: { establishmentId_code: { establishmentId: input.establishmentId, code: "400" } } },
              debit: 0,
              credit: total,
              description: `Proveedor ${supplier.name}`,
            },
          ],
        },
      },
    });

    await tx.outboxEvent.create({
      data: {
        aggregateType: "purchaseInvoice",
        aggregateId: invoice.id,
        eventType: "purchase.posted",
        payload: { purchaseInvoiceId: invoice.id, supplierId: supplier.id, total },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: "POST_PURCHASE",
        entityType: "purchaseInvoice",
        entityId: invoice.id,
        after: { number: input.number, supplier: supplier.name, total },
      },
    });
    return invoice;
  });
}

export async function processSaleStock(saleId: string): Promise<{ movements: number; lowStock: string[] }> {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: {
      lines: {
        include: {
          product: { include: { recipe: { include: { lines: { include: { stockItem: true } } } } } },
        },
      },
    },
  });
  if (!sale) throw new FiscalError("SALE_NOT_FOUND", "Venta no encontrada");

  let movements = 0;
  const lowStock: string[] = [];

  await prisma.$transaction(async (tx) => {
    for (const line of sale.lines) {
      const recipe = line.product.recipe;
      if (!recipe || recipe.lines.length === 0) continue;
      for (const rl of recipe.lines) {
        const qty = round2(Number(line.quantity) * Number(rl.quantity));
        if (qty <= 0) continue;
        const ref = `SALE:${sale.id}:${line.id}:${rl.stockItemId}`;
        const already = await tx.stockMovement.findFirst({ where: { reference: ref } });
        if (already) continue;
        await tx.stockMovement.create({
          data: {
            stockItem: { connect: { id: rl.stockItemId } },
            type: "OUT",
            quantity: qty,
            reference: ref,
          },
        });
        const item = await tx.stockItem.update({
          where: { id: rl.stockItemId },
          data: { quantity: { decrement: qty } },
        });
        movements++;
        if (Number(item.quantity) <= Number(item.minStock) && !lowStock.includes(item.name)) {
          lowStock.push(item.name);
          await tx.outboxEvent.create({
            data: {
              aggregateType: "stockItem",
              aggregateId: item.id,
              eventType: "stock.low",
              payload: {
                stockItemId: item.id,
                name: item.name,
                quantity: Number(item.quantity),
                minStock: Number(item.minStock),
              },
            },
          });
        }
      }
    }
  });

  return { movements, lowStock };
}

export async function drainOutbox(limit = 50): Promise<{ processed: number; failed: string[] }> {
  const events = await prisma.outboxEvent.findMany({
    where: { status: "PENDING" },
    orderBy: { occurredAt: "asc" },
    take: limit,
  });
  let processed = 0;
  const failed: string[] = [];
  for (const ev of events) {
    try {
      if (ev.eventType === "sale.confirmed") {
        const payload = ev.payload as { saleId?: string };
        if (payload.saleId) await processSaleStock(payload.saleId);
      }
      await prisma.outboxEvent.update({
        where: { id: ev.id },
        data: { status: "PROCESSED", processedAt: new Date() },
      });
      processed++;
    } catch (error) {
      console.error(`outbox ${ev.id} (${ev.eventType}) falló`, error);
      await prisma.outboxEvent.update({
        where: { id: ev.id },
        data: { status: "FAILED", attempts: { increment: 1 } },
      });
      failed.push(ev.id);
    }
  }
  return { processed, failed };
}

export async function listLowStock(establishmentId: string) {
  const items = await prisma.stockItem.findMany({
    where: { establishmentId, active: true },
    orderBy: { name: "asc" },
  });
  return items
    .filter((i) => Number(i.quantity) <= Number(i.minStock))
    .map((i) => ({
      id: i.id,
      name: i.name,
      sku: i.sku,
      unit: i.unit,
      quantity: Number(i.quantity),
      minStock: Number(i.minStock),
      unitCost: Number(i.unitCost),
    }));
}

export async function listStock(establishmentId: string) {
  const items = await prisma.stockItem.findMany({
    where: { establishmentId, active: true },
    orderBy: { name: "asc" },
  });
  return items.map((i) => ({
    id: i.id,
    name: i.name,
    sku: i.sku,
    unit: i.unit,
    quantity: Number(i.quantity),
    minStock: Number(i.minStock),
    unitCost: Number(i.unitCost),
    low: Number(i.quantity) <= Number(i.minStock),
  }));
}

export async function listMovements(establishmentId: string, limit = 100) {
  const movements = await prisma.stockMovement.findMany({
    where: { stockItem: { establishmentId } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { stockItem: true },
  });
  return movements.map((m) => ({
    id: m.id,
    type: m.type,
    quantity: Number(m.quantity),
    reference: m.reference,
    createdAt: m.createdAt.toISOString(),
    stockItem: { id: m.stockItem.id, name: m.stockItem.name, unit: m.stockItem.unit },
  }));
}

export async function saveRecipe(input: {
  establishmentId: string;
  productId: string;
  lines: Array<{ stockItemId: string; quantity: number }>;
  actorId?: string | null;
}) {
  for (const l of input.lines) {
    if (l.quantity <= 0) throw new FiscalError("INVALID_QUANTITY", "La cantidad de la receta debe ser positiva");
  }
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: input.productId, establishmentId: input.establishmentId },
    });
    if (!product) throw new FiscalError("PRODUCT_NOT_FOUND", "Producto no encontrado");

    const recipe = await tx.recipe.upsert({
      where: { productId: product.id },
      update: {},
      create: { productId: product.id },
    });
    await tx.recipeLine.deleteMany({ where: { recipeId: recipe.id } });
    for (const l of input.lines) {
      const item = await tx.stockItem.findFirst({
        where: { id: l.stockItemId, establishmentId: input.establishmentId, active: true },
      });
      if (!item) throw new FiscalError("STOCK_ITEM_NOT_FOUND", `Artículo de stock no encontrado: ${l.stockItemId}`);
      await tx.recipeLine.create({
        data: {
          recipe: { connect: { id: recipe.id } },
          stockItem: { connect: { id: item.id } },
          quantity: l.quantity,
        },
      });
    }
    const cost = await recomputeProductCost(tx, product.id);
    await tx.outboxEvent.create({
      data: {
        aggregateType: "product",
        aggregateId: product.id,
        eventType: "recipe.updated",
        payload: { productId: product.id, costStd: cost, lineCount: input.lines.length },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: "SAVE_RECIPE",
        entityType: "product",
        entityId: product.id,
        after: { lineCount: input.lines.length, costStd: cost },
      },
    });
    return { productId: product.id, costStd: cost };
  });
}

export async function listRecipes(establishmentId: string) {
  const products = await prisma.product.findMany({
    where: { establishmentId, active: true },
    include: {
      taxRate: true,
      category: true,
      recipe: { include: { lines: { include: { stockItem: true } } } },
    },
    orderBy: { name: "asc" },
  });
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    category: p.category.name,
    price: Number(p.price),
    taxPct: Number(p.taxRate.rate) * 100,
    costStd: Number(p.costStd),
    margin: Number(p.price) > 0 ? round2(Number(p.price) - Number(p.costStd)) : 0,
    marginPct: Number(p.price) > 0 ? round2(((Number(p.price) - Number(p.costStd)) / Number(p.price)) * 100) : 0,
    recipeLines: p.recipe
      ? p.recipe.lines.map((l) => ({
          stockItemId: l.stockItemId,
          name: l.stockItem.name,
          unit: l.stockItem.unit,
          quantity: Number(l.quantity),
          unitCost: Number(l.stockItem.unitCost),
        }))
      : [],
  }));
}
