# Gestión Bar — TPV + contabilidad fiscal (España)

Aplicación de gestión para un bar en España que combina operativa de sala (TPV) y
contabilidad, con cumplimiento fiscal español. Stack: **Next.js 15 (App Router) +
TypeScript + PostgreSQL (Prisma) + NextAuth**. Sin tests automatizados (alcance acordado).

## Estado: Fases 0-2 — cimientos fiscales + TPV/mesas/KDS + inventario/escandallos

Fase 0 (núcleo fiscal):

- Esquema PostgreSQL del núcleo: usuarios/roles, auditoría append-only, tipos de IVA
  versionados, series de facturación, facturas/tickets con **encadenamiento hash SHA-256**,
  ventas con líneas y pagos multi-método, contabilidad de doble partida, cierres de caja,
  tabla outbox para eventos de dominio, y modelos de inventario/comandas/personal (Fase 2+).
- Emisión de documentos fiscales inmutables: numeración correlativa por serie y año,
  hash encadenado (`previousHash` → `hash`), solo rectificativas (sin edición/borrado),
  evento outbox + auditoría por emisión. Verificación de cadena: `GET /api/fiscal/chain/verify`.
- Venta idempotente (`idempotencyKey` única): venta + pagos + **asiento contable automático**
  (Debe 570/572 → Haber 700/705 + 477 IVA repercutido por tipo) + evento `sale.confirmed`
  en la misma transacción.
- Control del límite de efectivo: se rechaza cualquier pago en efectivo ≥ 1.000 €
  (Ley 7/2012, art. 7, mod. Ley 11/2021) con error `CASH_LIMIT_1000`.
- Cierre de caja (arqueo): descuadre calculado y asiento automático (678/778).
- Auth con NextAuth (credenciales + JWT) y RBAC: `ADMIN`, `MANAGER`, `WAITER`, `ACCOUNTANT`.
- UI mínima: login, panel fiscal (ventas del día + estado de la cadena) y nueva venta.

Fase 1 (TPV y sala):

- **TPV táctil** en `/tpv`: rejilla de productos por categoría, comanda con cantidades,
  botón "Enviar comanda" a barra/cocina y panel de cobro multi-método (efectivo, tarjeta,
  contactless, Bizum, otro) con **división de cuenta** (pago del resto, importe manual,
  dividir entre N). El cobro emite el **ticket fiscal** (serie A, hash encadenado) y lo
  muestra listo para imprimir (estilos `@media print` 80 mm).
- **PWA offline-first**: `manifest.webmanifest` + service worker (`public/sw.js`) que cachea
  el shell de la app; las operaciones del TPV que fallan por red se encolan en IndexedDB
  (`src/lib/tpv-queue.ts`) con clave de idempotencia y se reintentan al reconectar.
  Supuesto: abrir venta y enviar comanda requieren conexión; el cobro sí funciona offline.
- **Mesas** en `/mesas`: estado visual (libre/ocupada), abrir mesa crea venta abierta
  (bloquea la mesa), enlace al TPV de esa venta; al cobrar, la mesa vuelve a libre.
- **KDS** en `/kds`: comandas en tiempo real vía SSE (`GET /api/kds/stream`, refresco 2 s)
  con estados PENDING → PREPARING → READY (`POST` vía server action `setOrderLineStatusAction`).
- **Acceso por PIN** en el TPV: segundo provider de NextAuth (`pin`, 4-6 dígitos); el login
  tiene pestaña email/contraseña o PIN. Seed: admin PIN 1234, camarero PIN 4321.
- Al cobrar (`paySale`) se genera en la misma transacción: pagos, asiento contable, ticket
  fiscal encadenado (vinculado a la venta vía `Invoice.saleId`), evento `sale.confirmed`,
  auditoría y liberación de la mesa.

Fase 2 (inventario y escandallos):

- **Compras a proveedores** (`/compras/nueva`, `POST /api/purchases`): al registrar una factura se crean
  los movimientos de entrada en el kardex (append-only), se actualiza el último coste de cada artículo,
  se recalcula el coste estándar de los productos afectados y se anota el asiento (600 + 472 → 400).
- **Descuento automático de stock**: el consumidor del outbox (`drainOutbox`) procesa `sale.confirmed`,
  expande las recetas de cada línea de venta y genera movimientos OUT con referencia `SALE:<id>:...`
  (idempotente por referencia). Se ejecuta tras cada cobro y vía cron en `POST /api/internal/drain`
  (header `x-internal-secret`).
- **Alertas de stock mínimo**: al cruzar el mínimo se emite `stock.low` y se muestra en `/inventario`
  y en el panel.
- **Escandallos** (`/carta`, `/carta/[id]`): receta por producto (ingrediente + cantidad), coste estándar
  = Σ cantidad × último coste, margen € y % por producto.

Pendiente por fases: Fase 3 contabilidad completa + OCR de facturas + conciliación bancaria,
Fase 4 personal/turnos/comisiones, Fase 5 envío Verifactu/SII/TicketBAI a la AEAT + agente de
impresión ESC/POS local.

## Puesta en marcha

```bash
cp .env.example .env          # ajusta DATABASE_URL y AUTH_SECRET
npm install
npx prisma migrate deploy     # aplica prisma/migrations (o migrate dev en desarrollo)
npm run db:seed               # bar de ejemplo + admin@bar.local / admin1234 (PIN 1234)
npm run dev                   # o npm run build && npm start (el SW solo actúa en producción/HTTPS)
```

## API

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/sales` | Crea una venta (idempotente por `idempotencyKey`) |
| POST | `/api/fiscal/documents` | Emite ticket/factura (simplificada, completa, rectificativa) |
| GET | `/api/fiscal/documents` | Lista documentos del establecimiento |
| GET | `/api/fiscal/chain/verify` | Verifica la integridad de la cadena hash |
| POST | `/api/cash/close` | Cierre/arqueo de caja del día |
| GET | `/api/kds/stream` | SSE con comandas del día (KDS) |
| GET | `/api/kds/orders` | Comandas del día en JSON |
| POST | `/api/purchases` | Registra compra (stock + asiento) |
| GET | `/api/inventory/stock?low=1` | Stock (solo bajo mínimo con `low=1`) |
| GET | `/api/inventory/movements` | Kardex |
| POST | `/api/inventory/recipe` | Guarda escandallo de un producto |
| POST | `/api/internal/drain` | Procesa el outbox (cron, `x-internal-secret`) |

Ejemplo de venta:

```bash
curl -X POST localhost:3000/api/sales -H 'content-type: application/json' -b "<sesión>" -d '{
  "idempotencyKey": "tpv-001",
  "lines": [{ "productId": "<id>", "quantity": 2 }],
  "payments": [{ "method": "CASH", "amount": 5.00 }]
}'
```

## Notas fiscales (a validar con asesor fiscal)

- Tipos de IVA sembrados: 21 % general (bebidas alcohólicas, espectáculos…), 10 % reducido
  (alimentos y bebidas sin alcohol en hostelería), 4 % superreducido, 0 % exento. La
  clasificación producto a producto debe confirmarse con el asesor.
- Los documentos son append-only con hash encadenado (RD 1007/2023, Verifactu-ready); el
  envío efectivo a la AEAT y SII/TicketBAI queda para la Fase 5 según calendario vigente.
- Límite de 1.000 € en efectivo aplicado por operación en el TPV.
- Conservación: 4 años (LGT). Backups cifrados fuera del servidor principal (pendiente Fase 5).

## Supuestos

Un único establecimiento; IVA trimestral (modelo 303); IRPF estimación directa (130);
hosting en la UE; PostgreSQL como única base de datos (ACID para la contabilidad).
