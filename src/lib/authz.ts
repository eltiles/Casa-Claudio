import { auth } from "@/auth";
import type { Role } from "@prisma/client";

export interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
  role: Role;
  establishmentId: string;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const user = session?.user;
  if (!user || !user.id || !user.establishmentId) return null;
  return {
    id: user.id,
    email: user.email ?? "",
    name: user.name,
    role: user.role as Role,
    establishmentId: user.establishmentId,
  };
}

export async function apiUser(allowedRoles?: Role[]) {
  const user = await getSessionUser();
  if (!user) return { user: null, status: 401 as const };
  if (allowedRoles && !allowedRoles.includes(user.role)) return { user: null, status: 403 as const };
  return { user, status: 200 as const };
}
