import type { Metadata, Viewport } from "next";
import "./globals.css";
import SwRegister from "@/components/sw-register";

export const metadata: Metadata = {
  title: "Gestión Bar",
  description: "TPV y contabilidad fiscal para bar en España",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#1d1b16",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <SwRegister />
        {children}
      </body>
    </html>
  );
}
