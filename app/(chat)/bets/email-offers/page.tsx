import Link from "next/link";
import { redirect } from "next/navigation";
import { EmailOffersInbox } from "@/components/bets/EmailOffersInbox";
import { Button } from "@/components/ui/button";
import { getTestAwareSession } from "@/lib/auth";

export const metadata = { title: "Email offers" };

export default async function EmailOffersPage() {
  const session = await getTestAwareSession();
  if (!session?.user) {
    redirect("/login");
  }
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-sm">Promotions</p>
          <h1 className="font-semibold text-2xl">Email offers</h1>
        </div>
        <Button asChild variant="outline">
          <Link href="/bets/settings/promos">Free bets & promotions</Link>
        </Button>
      </div>
      <EmailOffersInbox />
    </div>
  );
}
