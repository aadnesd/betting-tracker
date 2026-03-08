import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoGoogle } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { auth, signIn } from "../auth";

type RegisterPageProps = {
  searchParams: Promise<{
    callbackUrl?: string;
  }>;
};

export default async function Page({ searchParams }: RegisterPageProps) {
  const [{ callbackUrl = "/" }, session] = await Promise.all([
    searchParams,
    auth(),
  ]);

  if (session?.user) {
    redirect(callbackUrl);
  }

  return (
    <div className="flex h-dvh w-screen items-start justify-center bg-background pt-12 md:items-center md:pt-0">
      <div className="flex w-full max-w-md flex-col gap-10 overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-center justify-center gap-2 text-center">
          <h3 className="font-semibold text-foreground text-xl">
            Create Account
          </h3>
          <p className="text-muted-foreground text-sm">
            Use Google to create your matched betting workspace.
          </p>
        </div>
        <form
          action={async () => {
            "use server";

            await signIn("google", { redirectTo: callbackUrl });
          }}
        >
          <Button
            className="w-full justify-center gap-2"
            type="submit"
            variant="outline"
          >
            <LogoGoogle />
            Sign up with Google
          </Button>
        </form>
        <p className="text-center text-muted-foreground text-xs">
          Already have an account?{" "}
          <Link
            className="font-semibold text-foreground underline-offset-4 hover:underline"
            href="/login"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
