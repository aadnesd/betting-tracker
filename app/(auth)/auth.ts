import NextAuth, { type DefaultSession } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { findOrCreateOAuthUser, getUserById } from "@/lib/db/queries";
import { authConfig } from "./auth.config";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
    } & DefaultSession["user"];
  }

  // biome-ignore lint/nursery/useConsistentTypeDefinitions: "Required"
  interface User {
    id?: string;
    email?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
  }
}

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  providers: [
    Google,
    GitHub,
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google" || account?.provider === "github") {
        const email = user?.email ?? profile?.email;
        return Boolean(email);
      }

      return true;
    },
    async jwt({ token, user, account, profile }) {
      if (account?.provider === "google" || account?.provider === "github") {
        const email = user?.email ?? profile?.email;

        if (!email) {
          return token;
        }

        const { userId } = await findOrCreateOAuthUser({
          email,
          guestUserId: null,
        });

        token.id = userId;
      } else if (user) {
        token.id = user.id as string;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        // Verify the user still exists in the database
        const dbUser = await getUserById(token.id);
        if (!dbUser) {
          // User was deleted from database - return empty session
          // This will cause useSession to show unauthenticated state
          return { ...session, user: undefined, expires: new Date(0).toISOString() };
        }
        session.user.id = token.id;
      }

      return session;
    },
  },
});
