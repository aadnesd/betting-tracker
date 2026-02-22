import NextAuth, { type DefaultSession } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";
import Google from "next-auth/providers/google";
import { findOrCreateOAuthUser, getUserById } from "@/lib/db/queries";
import { authConfig } from "./auth.config";

const USER_EXISTS_CACHE_TTL_MS = 15_000;
const USER_EXISTS_CACHE_MAX_SIZE = 1000;

type UserExistsCacheEntry = {
  exists: boolean;
  expiresAt: number;
};

const userExistsCache = new Map<string, UserExistsCacheEntry>();
const inFlightUserChecks = new Map<string, Promise<boolean>>();

function compactUserExistsCache(now: number): void {
  for (const [userId, entry] of userExistsCache) {
    if (entry.expiresAt <= now) {
      userExistsCache.delete(userId);
    }
  }

  while (userExistsCache.size > USER_EXISTS_CACHE_MAX_SIZE) {
    const oldestUserId = userExistsCache.keys().next().value as
      | string
      | undefined;
    if (!oldestUserId) {
      break;
    }
    userExistsCache.delete(oldestUserId);
  }
}

function doesUserExist(userId: string): Promise<boolean> {
  const now = Date.now();
  const cached = userExistsCache.get(userId);

  if (cached && cached.expiresAt > now) {
    return Promise.resolve(cached.exists);
  }

  const inFlight = inFlightUserChecks.get(userId);
  if (inFlight) {
    return inFlight;
  }

  const checkPromise = getUserById(userId)
    .then((dbUser) => {
      const exists = Boolean(dbUser);
      const cacheTime = Date.now();

      userExistsCache.set(userId, {
        exists,
        expiresAt: cacheTime + USER_EXISTS_CACHE_TTL_MS,
      });
      compactUserExistsCache(cacheTime);

      return exists;
    })
    .finally(() => {
      inFlightUserChecks.delete(userId);
    });

  inFlightUserChecks.set(userId, checkPromise);
  return checkPromise;
}

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
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    signIn({ user, account, profile }) {
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
        const userExists = await doesUserExist(token.id);

        if (!userExists) {
          // User was deleted from database - return empty session
          // This will cause useSession to show unauthenticated state
          return {
            ...session,
            user: undefined,
            expires: new Date(0).toISOString(),
          };
        }
        session.user.id = token.id;
      }

      return session;
    },
  },
});
