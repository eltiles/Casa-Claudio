import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gestión Bar",
  description: "TPV y contabilidad fiscal para bar en España",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
