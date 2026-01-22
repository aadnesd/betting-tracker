import { connection } from "next/server";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { BetIntakeWrapper } from "@/components/bets/bet-intake-wrapper";
import { listAccountsByUser } from "@/lib/db/queries";

export const metadata = {
  title: "New matched bet",
};

export default async function Page() {
  await connection();
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const accounts = await listAccountsByUser({ userId: session.user.id });
  const isActive = (status: string | null | undefined) =>
    status === "active" || !status;

  const bookmakers = accounts
    .filter((account) => account.kind === "bookmaker" && isActive(account.status))
    .map((account) => ({
      id: account.id,
      name: account.name,
      kind: account.kind,
      currency: account.currency,
    }));

  const exchanges = accounts
    .filter((account) => account.kind === "exchange" && isActive(account.status))
    .map((account) => ({
      id: account.id,
      name: account.name,
      kind: account.kind,
      currency: account.currency,
    }));

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <p className="font-medium text-muted-foreground text-sm">
          Matched betting
        </p>
        <h1 className="font-semibold text-2xl">
          Upload back & lay screenshots
        </h1>
        <p className="text-muted-foreground text-sm">
          Paste screenshots from your clipboard (⌘V), drag & drop, or browse files.
          AI parsing starts automatically when both screenshots are ready.
        </p>
      </div>
      <BetIntakeWrapper bookmakers={bookmakers} exchanges={exchanges} />
    </div>
  );
}
