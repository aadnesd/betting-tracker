import { redirect } from "next/navigation";

/**
 * Root page redirects to the matched betting dashboard.
 * The original chatbot interface has been removed as the product
 * is now focused on matched betting tracking.
 */
export default function Page() {
  redirect("/bets");
}
