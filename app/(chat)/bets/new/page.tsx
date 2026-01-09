import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { BetIngestForm } from "@/components/bets/bet-ingest-form";

export const metadata = {
  title: "New matched bet",
};

// Force dynamic rendering so build doesn't attempt to pre-render auth-protected page data.
export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await auth();

  if (!session) {
    redirect("/api/auth/guest");
  }

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
          We will parse both slips, align markets, and create a matched bet
          record.
        </p>
      </div>
      <BetIngestForm />
    </div>
  );
}
