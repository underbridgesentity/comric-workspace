import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import type { Role } from "@/lib/schema";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: Role;
      image?: string | null;
    };
  }
  interface User {
    role?: Role;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Credentials + JWT sessions (secure httpOnly cookies). User records live
  // in the users table in Aurora (Cape Town); no adapter needed for JWT flow.
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email.toLowerCase().trim()))
          .limit(1);

        if (!user || !user.isActive || !user.passwordHash) return null;
        const valid = await compare(password, user.passwordHash);
        if (!valid) return null;

        void db
          .update(users)
          .set({ lastSeenAt: new Date() })
          .where(eq(users.id, user.id))
          .catch(() => undefined);

        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          image: user.avatarUrl,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as Role) ?? "read_only";
      }
      return session;
    },
  },
});

/**
 * Convenience for API routes: returns the current user's id + role or null.
 */
export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session.user;
}
