import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { sha256Hex } from "@/lib/hash";

function sessionPayload(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  establishmentId: string;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    establishmentId: user.establishmentId,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      id: "credentials",
      name: "Credenciales",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").toLowerCase().trim();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.active) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;
        return sessionPayload(user);
      },
    }),
    Credentials({
      id: "pin",
      name: "PIN",
      credentials: {
        pin: { label: "PIN", type: "password" },
      },
      async authorize(credentials) {
        const pin = String(credentials?.pin ?? "");
        if (!/^\d{4,6}$/.test(pin)) return null;
        const user = await prisma.user.findUnique({
          where: { pinLookup: sha256Hex(pin) },
        });
        if (!user || !user.active || !user.pinHash) return null;
        const ok = await bcrypt.compare(pin, user.pinHash);
        if (!ok) return null;
        return sessionPayload(user);
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.establishmentId = user.establishmentId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.role = token.role as string;
        session.user.establishmentId = token.establishmentId as string;
      }
      return session;
    },
  },
});
