import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      establishmentId: string;
    } & DefaultSession["user"];
  }

  interface User {
    role?: string;
    establishmentId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    establishmentId?: string;
  }
}
