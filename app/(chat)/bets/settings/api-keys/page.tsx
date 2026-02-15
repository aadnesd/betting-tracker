import { AlertTriangle, ExternalLink, Key, Smartphone } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { ApiKeyManager } from "@/components/bets/api-key-manager";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getShortcutApiKeyInfo } from "@/lib/db/queries";

export const metadata = {
  title: "API Keys",
};

export default async function ApiKeysPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const userId = session.user.id;
  const keyInfo = await getShortcutApiKeyInfo({ userId });

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="font-medium text-muted-foreground text-sm">Settings</p>
          <h1 className="font-semibold text-2xl">API Keys</h1>
          <p className="text-muted-foreground text-sm">
            Manage API keys for external integrations like iOS Shortcuts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/bets">← Back to dashboard</Link>
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              iOS Shortcut API
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-blue-500" />
              <p className="font-semibold">
                {keyInfo?.hasKey ? "Active" : "Not configured"}
              </p>
            </div>
            <p className="text-muted-foreground text-sm">
              {keyInfo?.hasKey
                ? `Created ${keyInfo.createdAt?.toLocaleDateString()}`
                : "Generate a key to get started"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              Rate Limit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold">1 request / 10 seconds</p>
            <p className="text-muted-foreground text-sm">
              Prevents accidental double-taps
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              Authentication
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5 text-amber-500" />
              <p className="font-semibold">Bearer Token</p>
            </div>
            <p className="text-muted-foreground text-sm">
              SHA-256 hashed for security
            </p>
          </CardContent>
        </Card>
      </div>

      {/* API Key Manager */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            iOS Shortcut API Key
          </CardTitle>
          <CardDescription>
            Generate an API key to use with iOS Shortcuts. This allows you to
            submit matched bets directly from your phone without opening the web
            app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ApiKeyManager
            createdAt={keyInfo?.createdAt?.toISOString() ?? null}
            hasKey={keyInfo?.hasKey ?? false}
            hint={keyInfo?.hint ?? null}
          />
        </CardContent>
      </Card>

      {/* Setup Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            How to Set Up iOS Shortcut
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="list-inside list-decimal space-y-3 text-sm">
            <li>
              <strong>Generate an API key</strong> using the form above
            </li>
            <li>
              <strong>Copy the key</strong> immediately (it won't be shown
              again)
            </li>
            <li>
              <strong>Create a new Shortcut</strong> in the iOS Shortcuts app
            </li>
            <li>
              Add <strong>"Get Contents of URL"</strong> action with:
              <ul className="mt-2 ml-6 space-y-1 text-muted-foreground">
                <li>
                  • URL:{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    https://yoursite.com/api/bets/shortcut
                  </code>
                </li>
                <li>• Method: POST</li>
                <li>• Headers: Authorization: Bearer YOUR_API_KEY</li>
                <li>• Body: Form with "back" and "lay" image fields</li>
              </ul>
            </li>
            <li>
              <strong>Add image input</strong> using "Select Photos" or share
              sheet
            </li>
            <li>
              <strong>Parse the response</strong> and show a notification with
              the result
            </li>
          </ol>

          <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
              <div>
                <h4 className="font-medium text-amber-900">Security Note</h4>
                <p className="text-amber-800 text-sm">
                  Your API key provides full access to create bets in your
                  account. Keep it secure and never share it. If you suspect it
                  has been compromised, revoke it immediately and generate a new
                  one.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* API Reference */}
      <Card>
        <CardHeader>
          <CardTitle>API Reference</CardTitle>
          <CardDescription>
            Technical details for developers building integrations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="mb-2 font-medium">Endpoint</h4>
            <code className="block rounded bg-muted p-3 text-sm">
              POST /api/bets/shortcut
            </code>
          </div>

          <div>
            <h4 className="mb-2 font-medium">Request Headers</h4>
            <pre className="overflow-x-auto rounded bg-muted p-3 text-sm">
              {`Authorization: Bearer <your-api-key>
Content-Type: multipart/form-data`}
            </pre>
          </div>

          <div>
            <h4 className="mb-2 font-medium">Request Body (FormData)</h4>
            <ul className="space-y-1 text-muted-foreground text-sm">
              <li>
                • <code>back</code> (required): Back bet screenshot (PNG/JPEG,
                max 10MB)
              </li>
              <li>
                • <code>lay</code> (required): Lay bet screenshot (PNG/JPEG, max
                10MB)
              </li>
              <li>
                • <code>promoType</code> (optional): Promo type string (default:
                "None")
              </li>
              <li>
                • <code>notes</code> (optional): Notes for the bet
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-2 font-medium">Response (Success)</h4>
            <pre className="overflow-x-auto rounded bg-muted p-3 text-sm">
              {`{
  "success": true,
  "matchedBetId": "uuid",
  "status": "matched" | "needs_review",
  "market": "Team A v Team B",
  "selection": "Team A",
  "back": { "bookmaker": "...", "odds": 1.5, "stake": 100, "currency": "NOK" },
  "lay": { "exchange": "...", "odds": 1.52, "stake": 1000, "currency": "NOK" },
  "netExposure": 1234.56,
  "linkedMatch": { ... } | null,
  "needsReview": false
}`}
            </pre>
          </div>

          <div>
            <h4 className="mb-2 font-medium">Error Codes</h4>
            <ul className="space-y-1 text-muted-foreground text-sm">
              <li>
                • <code>401 INVALID_API_KEY</code>: Missing or invalid API key
              </li>
              <li>
                • <code>429 RATE_LIMITED</code>: Too many requests (wait 10
                seconds)
              </li>
              <li>
                • <code>400 MISSING_IMAGES</code>: Back or lay image not
                provided
              </li>
              <li>
                • <code>400 INVALID_IMAGE_TYPE</code>: Image must be PNG or JPEG
              </li>
              <li>
                • <code>400 IMAGE_TOO_LARGE</code>: Image exceeds 10MB
              </li>
              <li>
                • <code>500 PARSE_FAILED</code>: AI parsing failed
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
