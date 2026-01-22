"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { Suspense, useEffect } from "react";
import { LogoGoogle } from "@/components/icons";
import { Button } from "@/components/ui/button";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, status } = useSession();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  useEffect(() => {
    if (status === "authenticated" && data?.user) {
      router.replace(callbackUrl);
    }
  }, [data?.user, router, status, callbackUrl]);

  return (
    <div className="flex h-dvh w-screen items-start justify-center bg-background pt-12 md:items-center md:pt-0">
      <div className="flex w-full max-w-md flex-col gap-10 overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-center justify-center gap-2 text-center">
          <h3 className="font-semibold text-xl text-foreground">Sign In</h3>
          <p className="text-muted-foreground text-sm">
            Sign in with your account to access your matched betting data.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Button
            className="w-full justify-center gap-2"
            onClick={() => signIn("google", { redirectTo: callbackUrl })}
            type="button"
            variant="outline"
          >
            <LogoGoogle />
            Continue with Google
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="flex h-dvh w-screen items-center justify-center">Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}
