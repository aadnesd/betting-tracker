"use client";

import { Github } from "lucide-react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { useEffect } from "react";
import { LogoGoogle } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { guestRegex } from "@/lib/constants";

export default function Page() {
  const router = useRouter();
  const { data, status } = useSession();
  const isGuest = guestRegex.test(data?.user?.email ?? "");

  useEffect(() => {
    if (status === "authenticated" && data?.user?.type === "regular") {
      router.replace("/");
    }
  }, [data?.user?.type, router, status]);

  return (
    <div className="flex h-dvh w-screen items-start justify-center bg-background pt-12 md:items-center md:pt-0">
      <div className="flex w-full max-w-md flex-col gap-10 overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-center justify-center gap-2 text-center">
          <h3 className="font-semibold text-xl text-foreground">Create Account</h3>
          <p className="text-muted-foreground text-sm">
            Use Google or GitHub to create your matched betting workspace.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Button
            className="w-full justify-center gap-2"
            onClick={() => signIn("google", { redirectTo: "/" })}
            type="button"
            variant="outline"
          >
            <LogoGoogle />
            Sign up with Google
          </Button>
          <Button
            className="w-full justify-center gap-2"
            onClick={() => signIn("github", { redirectTo: "/" })}
            type="button"
            variant="outline"
          >
            <Github className="size-4" />
            Sign up with GitHub
          </Button>
          <Button
            className="w-full"
            onClick={() => router.push("/api/auth/guest?redirectUrl=/")}
            type="button"
            variant="secondary"
          >
            {isGuest ? "Continue as guest" : "Try as guest"}
          </Button>
        </div>
        <p className="text-center text-muted-foreground text-xs">
          Already have an account?{" "}
          <button
            className="font-semibold text-foreground underline-offset-4 hover:underline"
            onClick={() => router.push("/login")}
            type="button"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
