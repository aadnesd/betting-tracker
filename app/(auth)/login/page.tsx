import { redirect } from "next/navigation";
import { LogoGoogle } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { auth, signIn } from "../auth";

type LoginPageProps = {
  searchParams: Promise<{
    callbackUrl?: string;
  }>;
};

export default async function Page({ searchParams }: LoginPageProps) {
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
          <h3 className="font-semibold text-foreground text-xl">Sign In</h3>
          <p className="text-muted-foreground text-sm">
            Sign in with your account to access your matched betting data.
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
            Continue with Google
          </Button>
        </form>
      </div>
    </div>
  );
}
