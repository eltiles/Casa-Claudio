import Link from "next/link";

export const dynamic = "force-dynamic";

export default function PrivacidadPage() {
  return (
    <>
      <header className="topbar">
        <strong>Privacidad y RGPD</strong>
        <Link href="/dashboard">Panel</Link>
        <Link href="/login">Acceso</Link>
      </header>
      <main style={{ maxWidth: 800 }}>
        <h1>Privacidad y protección de datos (RGPD)</h1>
        <div className="card">
          <h2>Responsable</h2>
          <p>El establecimiento configurado en la aplicación (ver ficha en «Panel»). Contacto: el email del administrador.</p>
          <h2>Datos tratados</h2>
          <ul>
            <li>Usuarios del TPV: nombre, email, hash de contraseña, hash de PIN, secreto 2FA (nunca en claro).</li>
            <li>Operativa: ventas, tickets/facturas (con NIF de clientes cuando se emite factura completa), pagos, asientos, movimientos de stock y bancarios.</li>
            <li>Auditoría: acciones con actor, fecha y detalle (append-only, sin borrado).</li>
          </ul>
          <h2>Finalidades y bases</h2>
          <ul>
            <li>Gestión operativa y atención al cliente — ejecución de contrato / interés legítimo.</li>
            <li>Cumplimiento de obligaciones fiscales y contables (Verifactu, modelos AEAT) — obligación legal.</li>
            <li>Seguridad (auditoría, control de accesos) — interés legítimo.</li>
          </ul>
          <h2>Derechos ARCO</h2>
          <p>Acceso, rectificación, cancelación, oposición, portabilidad y limitación: escribir al administrador. Plazo de respuesta: 1 mes.</p>
          <h2>Conservación y seguridad</h2>
          <ul>
            <li>Documentos fiscales: 4 años (plazo de prescripción tributaria, LGT art. 30).</li>
            <li>Cifrado en tránsito (TLS) y en reposo; backups cifrados fuera del servidor (scripts/backup.sh).</li>
            <li>Proveedores cloud con DPA y región UE; datos de tarjeta nunca tocan nuestros servidores (pasarela tokeniza).</li>
          </ul>
        </div>
      </main>
    </>
  );
}
