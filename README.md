# Gestión Bar — TPV + contabilidad fiscal (España)

Aplicación de gestión para un bar en España que combina operativa de sala (TPV) y
contabilidad, con cumplimiento fiscal español. Stack: **Next.js 15 (App Router) +
TypeScript + PostgreSQL (Prisma) + NextAuth**. Sin tests automatizados (alcance acordado).

## Estado: Fase 0 — cimientos + fiscalidad mínima viable

Implementado:

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

Pendiente por fases (ver especificación): Fase 1 TPV táctil PWA offline + mesas/KDS,
Fase 2 inventario + escandallos, Fase 3 contabilidad completa + OCR + conciliación bancaria,
Fase 4 personal/turnos/comisiones, Fase 5 envío Verifactu/SII/TicketBAI a la AEAT.

## Puesta en marcha

```bash
cp .env.example .env          # ajusta DATABASE_URL y AUTH_SECRET
npm install
npx prisma migrate dev        # crea el esquema
npm run db:seed               # bar de ejemplo + admin@bar.local / admin1234
npm run dev
```

## API

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/sales` | Crea una venta (idempotente por `idempotencyKey`) |
| POST | `/api/fiscal/documents` | Emite ticket/factura (simplificada, completa, rectificativa) |
| GET | `/api/fiscal/documents` | Lista documentos del establecimiento |
| GET | `/api/fiscal/chain/verify` | Verifica la integridad de la cadena hash |
| POST | `/api/cash/close` | Cierre/arqueo de caja del día |

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
