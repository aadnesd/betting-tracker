# iOS Shortcut Setup Guide

This guide walks you through creating an iOS Shortcut to submit bet screenshots directly from your iPhone to the matched betting tracker.

## Prerequisites

1. iPhone running iOS 15 or later
2. Shortcuts app installed (comes pre-installed)
3. An API key from the tracker (generated in Settings → API Keys)

---

## Step 1: Generate Your API Key

1. Open the tracker in Safari: `https://nextjs-ai-chatbot-xi-red-23.vercel.app/bets`
2. Navigate to **Settings → API Keys** (or go directly to `https://nextjs-ai-chatbot-xi-red-23.vercel.app/bets/settings/api-keys`)
3. Click **Generate API Key**
4. **Copy the key immediately** — it will only be shown once
5. Save it somewhere secure (e.g., Notes app, password manager)

---

## Step 2: Create the Shortcut

### Option A: Quick Setup (Recommended)

1. Open the **Shortcuts** app
2. Tap the **+** button to create a new shortcut
3. Tap **Add Action**
4. Search for "Get Images from Input" and add it
5. Add another action: search for "Get Contents of URL"

### Option B: Step-by-Step Manual Setup

#### 2.1 Start the Shortcut

1. Open **Shortcuts** app
2. Tap **+** (top right)
3. Name it "Submit Bet" (tap the name at top)

#### 2.2 Accept Share Sheet Input

1. Tap **ⓘ** (info button at bottom)
2. Enable **Show in Share Sheet**
3. Under "Share Sheet Types", select only **Images**
4. Tap **Done**

#### 2.3 Get the Images

1. Tap **Add Action**
2. Search for **"Get Images from Input"**
3. Add it — this captures images shared to the shortcut

#### 2.4 Send to API

1. Tap **Add Action**
2. Search for **"Get Contents of URL"**
3. Configure it:

| Field | Value |
|-------|-------|
| URL | `https://nextjs-ai-chatbot-xi-red-23.vercel.app/api/bets/shortcut` |
| Method | **POST** |
| Request Body | **Form** |

4. Add form fields by tapping **Add new field** → **File**:
   - Key: `back`
   - Value: Tap and select **Shortcut Input** or **Images**

5. Add Headers by tapping **Show More** → **Headers** → **Add new header**:
   - Key: `Authorization`
   - Value: `Bearer YOUR_API_KEY_HERE`

#### 2.5 Show Result

1. Tap **Add Action**
2. Search for **"Show Notification"** or **"Show Result"**
3. Set the input to the output of "Get Contents of URL"

---

## Step 3: Test the Shortcut

1. Open your betting app and take a screenshot of a placed bet
2. Open the screenshot in Photos
3. Tap the **Share** button
4. Scroll down and tap **Submit Bet** (your shortcut)
5. Wait for the response — you should see a success notification

---

## Complete Shortcut Structure

```
┌─────────────────────────────────────────┐
│  Receive Images input from Share Sheet  │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  Get Images from Shortcut Input         │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  Get Contents of URL                    │
│  ─────────────────────────────────────  │
│  URL: https://nextjs-ai-chatbot-xi-red- │
│       23.vercel.app/api/bets/shortcut   │
│  Method: POST                           │
│  Request Body: Form                     │
│    • back: [Images]                     │
│  Headers:                               │
│    • Authorization: Bearer <key>        │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  Show Notification                      │
│  "Bet submitted: [result]"              │
└─────────────────────────────────────────┘
```

---

## Submitting Both Back and Lay Screenshots

If you have both the back bet screenshot and lay bet screenshot:

1. Select **both images** in Photos (tap Select, then tap both)
2. Tap **Share**
3. Run the shortcut

Or modify the shortcut to accept two images:

1. Change form fields to:
   - `back`: First image
   - `lay`: Second image

2. Use **"Get Item from List"** action:
   - Get **Item at Index 1** → assign to `back`
   - Get **Item at Index 2** → assign to `lay`

---

## Troubleshooting

### "Invalid API Key" Error

- Double-check you copied the full API key
- Ensure the `Authorization` header format is exactly: `Bearer YOUR_KEY`
- The key is case-sensitive

### "Rate Limited" Error

- Wait 10 seconds between submissions
- The API enforces a cooldown to prevent accidental duplicates

### "Parse Failed" Error

- Ensure the screenshot clearly shows bet details
- Try a cleaner screenshot without obstructions
- Make sure text is readable (not cropped)

### Shortcut Not Appearing in Share Sheet

1. Open **Shortcuts** app
2. Long-press your shortcut → **Edit**
3. Tap **ⓘ** at bottom
4. Ensure **Show in Share Sheet** is ON
5. Ensure **Images** is selected under Share Sheet Types

### Images Not Sending

- Check that "Get Images from Input" comes before "Get Contents of URL"
- In the URL action, make sure form field type is **File**, not Text

---

## API Response Format

Successful response:
```json
{
  "success": true,
  "matchedSet": {
    "id": "abc123",
    "sport": "Football",
    "event": "Arsenal vs Chelsea",
    "market": "Both Teams to Score",
    "backAccount": "Bet365",
    "layAccount": "Betfair Exchange",
    "profitNOK": 125.50
  }
}
```

Error response:
```json
{
  "success": false,
  "error": {
    "code": "PARSE_FAILED",
    "message": "Could not extract bet details from image"
  }
}
```

---

## Tips for Best Results

1. **Screenshot timing**: Capture immediately after placing the bet while the confirmation is visible
2. **Full screen**: Don't crop — include the full bet slip
3. **Good lighting**: Avoid glare or dark screenshots
4. **One bet per screenshot**: Don't combine multiple bets in one image
5. **Submit both screenshots**: For matched bets, submit back and lay together for automatic linking

---

## Security Notes

- Your API key is stored securely (hashed, not in plaintext)
- Only you can access bets submitted with your key
- Revoke the key anytime from Settings → API Keys
- Generate a new key if you suspect it's compromised
