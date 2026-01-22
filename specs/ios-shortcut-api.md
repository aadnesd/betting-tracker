# iOS Shortcut API Specification

## Overview

A dedicated API endpoint that allows users to submit matched bet screenshots directly from their iOS device using Apple Shortcuts, without needing to open the web application. The endpoint combines screenshot upload, AI parsing, match linking, and bet creation into a single atomic operation.

## User Story

As a matched bettor, I want to:
1. Take a screenshot of my back bet on my phone
2. Take a screenshot of my lay bet on my phone
3. Run an iOS Shortcut that sends both images to the API
4. Receive confirmation that my bet was recorded

This eliminates the need to:
- Open the web app on mobile
- Navigate to the intake page
- Upload files manually
- Wait for the review form
- Submit the bet

## Authentication

### Per-User API Key

Each user can generate a unique API key for Shortcut access:

- **Key format**: 64-character hex string (256-bit random)
- **Storage**: `UserSettings.shortcutApiKey` (hashed with SHA-256)
- **Display**: Shown once on generation, then only last 8 characters visible
- **Revocation**: Immediate invalidation, requires generating new key

### Request Authentication

```
Authorization: Bearer <api-key>
```

The API key is validated against stored hash. Invalid/missing key returns `401 Unauthorized`.

## Rate Limiting

Prevent accidental double-submissions and abuse:

- **Limit**: 1 request per 10 seconds per user
- **Implementation**: `UserSettings.lastShortcutRequestAt` timestamp
- **Response**: `429 Too Many Requests` with `Retry-After` header

## API Endpoint

### `POST /api/bets/shortcut`

#### Request

**Headers:**
```
Authorization: Bearer <api-key>
Content-Type: multipart/form-data
```

**Body (FormData):**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `back` | File | Yes | Back bet screenshot (PNG/JPEG, max 10MB) |
| `lay` | File | Yes | Lay bet screenshot (PNG/JPEG, max 10MB) |
| `promoType` | String | No | Promo type (defaults to "None") |
| `notes` | String | No | Optional notes for the bet |

#### Success Response (200)

```json
{
  "success": true,
  "matchedBetId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "matched",
  "market": "Bodo/Glimt - Manchester City FC",
  "selection": "Manchester City FC",
  "back": {
    "bookmaker": "Stake",
    "odds": 1.41,
    "stake": 5900,
    "currency": "USD"
  },
  "lay": {
    "exchange": "BFB",
    "odds": 1.41,
    "stake": 60000,
    "liability": 24600,
    "currency": "NOK"
  },
  "netExposure": 22181,
  "linkedMatch": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "homeTeam": "FK Bodø/Glimt",
    "awayTeam": "Manchester City FC",
    "matchDate": "2026-01-20T18:45:00Z",
    "competition": "Champions League"
  },
  "needsReview": false,
  "notes": null
}
```

#### Needs Review Response (200)

When parsing confidence is low or accounts couldn't be matched:

```json
{
  "success": true,
  "matchedBetId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "needs_review",
  "market": "Some Match",
  "selection": "Team A",
  "needsReview": true,
  "reviewReasons": [
    "Low confidence in odds extraction (0.65)",
    "Bookmaker 'NewBookie' not found in your accounts"
  ],
  "notes": "Please review in web app"
}
```

#### Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 400 | `MISSING_IMAGES` | Back or lay image not provided |
| 400 | `INVALID_IMAGE_TYPE` | Image must be PNG or JPEG |
| 400 | `IMAGE_TOO_LARGE` | Image exceeds 10MB limit |
| 401 | `INVALID_API_KEY` | API key missing or invalid |
| 429 | `RATE_LIMITED` | Too many requests, try again later |
| 500 | `PARSE_FAILED` | AI parsing failed |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

```json
{
  "success": false,
  "error": "INVALID_API_KEY",
  "message": "The provided API key is invalid or has been revoked"
}
```

## Processing Pipeline

The endpoint executes these steps atomically:

1. **Validate API key** → 401 if invalid
2. **Check rate limit** → 429 if too soon
3. **Validate images** → 400 if invalid
4. **Update rate limit timestamp**
5. **Upload screenshots to blob storage**
6. **Save screenshot records to DB**
7. **Fetch user's accounts**
8. **Run agentic parser** (OCR + LLM with account context)
9. **Link to football match** (if confident)
10. **Create matched bet record**
11. **Create audit entries**
12. **Return result**

If any step after #4 fails, the bet is NOT created and an error is returned.

## Database Schema Changes

### UserSettings Table Extensions

```sql
ALTER TABLE "UserSettings" ADD COLUMN "shortcutApiKey" VARCHAR(64);
ALTER TABLE "UserSettings" ADD COLUMN "shortcutApiKeyCreatedAt" TIMESTAMP;
ALTER TABLE "UserSettings" ADD COLUMN "lastShortcutRequestAt" TIMESTAMP;
```

Note: `shortcutApiKey` stores the SHA-256 hash of the actual key, not the key itself.

## Settings UI

### API Keys Page (`/bets/settings/api-keys`)

**No Key Generated State:**
```
┌─────────────────────────────────────────────────────┐
│ iOS Shortcut API Key                                │
│                                                     │
│ Generate an API key to use with iOS Shortcuts.      │
│ This allows you to submit matched bets directly     │
│ from your phone without opening the web app.        │
│                                                     │
│ [Generate API Key]                                  │
└─────────────────────────────────────────────────────┘
```

**Key Generated State (immediately after generation):**
```
┌─────────────────────────────────────────────────────┐
│ iOS Shortcut API Key                                │
│                                                     │
│ ⚠️ Save this key now - it won't be shown again!    │
│                                                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │ a1b2c3d4e5f6...7890abcdef1234567890       [📋] │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ Created: January 22, 2026 at 3:45 PM               │
│                                                     │
│ [Revoke Key]                                        │
└─────────────────────────────────────────────────────┘
```

**Key Exists State (after page reload):**
```
┌─────────────────────────────────────────────────────┐
│ iOS Shortcut API Key                                │
│                                                     │
│ Key: ••••••••••••••••••••••••••••••••7890abcd      │
│ Created: January 22, 2026 at 3:45 PM               │
│                                                     │
│ [Revoke Key] [Generate New Key]                     │
└─────────────────────────────────────────────────────┘
```

### Setup Instructions Section

```
┌─────────────────────────────────────────────────────┐
│ How to Set Up iOS Shortcut                          │
│                                                     │
│ 1. Copy your API key above                          │
│ 2. Download our iOS Shortcut template:              │
│    [Download Shortcut]                              │
│ 3. When prompted, paste your API key                │
│ 4. The shortcut will appear in your Shortcuts app   │
│                                                     │
│ Usage:                                              │
│ 1. Take a screenshot of your back bet               │
│ 2. Take a screenshot of your lay bet                │
│ 3. Select both images and share to the shortcut     │
│ 4. You'll receive a notification when complete      │
└─────────────────────────────────────────────────────┘
```

## iOS Shortcut Design

The iOS Shortcut should:

1. **Accept input**: 2 images from share sheet or photo picker
2. **Prompt for order**: "Which image is the BACK bet?" (first/second)
3. **Build request**: Create multipart form with images
4. **Send to API**: POST to `/api/bets/shortcut` with Bearer auth
5. **Parse response**: Extract success/error status
6. **Show notification**: 
   - Success: "Bet saved! {market} - {selection}"
   - Needs review: "Bet saved (needs review) - check web app"
   - Error: "Failed: {error message}"

## Security Considerations

1. **Key hashing**: Store SHA-256 hash, not plaintext key
2. **HTTPS only**: Reject HTTP requests in production
3. **Rate limiting**: Prevent brute force and abuse
4. **Key rotation**: Users can revoke and regenerate keys
5. **No key enumeration**: Same error for invalid vs nonexistent keys
6. **Audit logging**: Log all shortcut API usage

## Testing

### Unit Tests

- `generateShortcutApiKey` creates valid 64-char hex key
- `validateShortcutApiKey` correctly validates against hash
- `validateShortcutApiKey` rejects invalid/expired keys
- Rate limiting blocks requests within 10 seconds
- Rate limiting allows requests after 10 seconds

### Integration Tests

- Full flow: upload → parse → link → save → return
- Missing image returns 400
- Invalid API key returns 401
- Rate limit exceeded returns 429
- Parse failure returns 500 with error details
- Low confidence bet saved as `needs_review`

### Manual Testing

1. Generate API key in settings
2. Create iOS Shortcut with the key
3. Submit two test screenshots
4. Verify bet appears in dashboard
5. Revoke key and verify requests fail

## Future Enhancements

- **Android support**: Document Tasker/Automate setup
- **Webhook notifications**: Push to user's webhook on completion
- **Batch mode**: Submit multiple bet pairs in one request
- **Draft mode**: Save as draft for later review
- **Custom promo selection**: Allow specifying promo type in request
