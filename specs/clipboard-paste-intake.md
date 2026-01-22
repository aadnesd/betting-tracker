# Clipboard Paste Intake

## Overview

Add the ability to paste screenshots directly from clipboard into the bet intake flow, **alongside the existing file upload option**. This streamlines the workflow for desktop users who use OS-level screenshot snippet tools (macOS Cmd+Shift+4, Windows Snipping Tool) which copy images to clipboard.

**Important:** File upload (drag-and-drop, file picker) remains fully functional as a fallback for:
- Mobile users who can't easily paste from clipboard
- Users who have already saved screenshot files to disk
- Users who prefer the traditional file picker workflow

## User Story

As a matched bettor, I want to paste my bet screenshots directly from my clipboard so that I can quickly capture and parse bets without saving files to disk first.

## Current Flow (File Upload)

1. Take screenshot of back bet → saved to Downloads
2. Take screenshot of lay bet → saved to Downloads
3. Navigate to `/bets/new`
4. Drag/drop or click to select back bet file
5. Drag/drop or click to select lay bet file
6. Click "Upload & Parse"
7. Wait for parsing
8. Review and save

## New Flow (Clipboard Paste)

1. Take screenshot snippet of back bet (Cmd+Shift+4 on Mac) → copied to clipboard
2. Navigate to `/bets/new`, click in "Back Bet" paste zone, press Cmd+V
3. See thumbnail preview of back bet
4. Take screenshot snippet of lay bet → copied to clipboard
5. Click in "Lay Bet" paste zone, press Cmd+V
6. See thumbnail preview of lay bet
7. **Parsing starts automatically** when both images are present
8. Review and save

## UI Design

### Paste Zones

The `/bets/new` page displays two input zones side by side (or stacked on mobile):

```
┌─────────────────────────────────┐  ┌─────────────────────────────────┐
│         BACK BET                │  │         LAY BET                 │
│                                 │  │                                 │
│    📋 Click and paste (⌘V)     │  │    📋 Click and paste (⌘V)     │
│                                 │  │                                 │
│    ─────── or ───────          │  │    ─────── or ───────          │
│                                 │  │                                 │
│    📁 Drop file / Browse       │  │    📁 Drop file / Browse       │
│                                 │  │                                 │
└─────────────────────────────────┘  └─────────────────────────────────┘
```

On mobile, the "Browse" button is more prominent since clipboard paste is less convenient on touch devices.

### After Pasting

When an image is pasted, the zone transforms to show a thumbnail preview:

```
┌─────────────────────────────────┐  ┌─────────────────────────────────┐
│         BACK BET ✓              │  │         LAY BET                 │
│  ┌─────────────────────────┐    │  │                                 │
│  │  [Thumbnail Preview]    │    │  │    📋 Click and paste (⌘V)     │
│  │                         │    │  │    or drag & drop a file        │
│  └─────────────────────────┘    │  │                                 │
│         [✕ Remove]              │  │                                 │
└─────────────────────────────────┘  └─────────────────────────────────┘
```

### Auto-Parse Trigger

When both zones have images:

```
┌─────────────────────────────────┐  ┌─────────────────────────────────┐
│         BACK BET ✓              │  │         LAY BET ✓               │
│  ┌─────────────────────────┐    │  │  ┌─────────────────────────┐    │
│  │  [Thumbnail Preview]    │    │  │  │  [Thumbnail Preview]    │    │
│  │                         │    │  │  │                         │    │
│  └─────────────────────────┘    │  │  └─────────────────────────┘    │
│         [✕ Remove]              │  │         [✕ Remove]              │
└─────────────────────────────────┘  └─────────────────────────────────┘

              ⏳ Parsing screenshots... (auto-started)
```

## Technical Implementation

### Clipboard API

Use the browser's Clipboard API to read pasted images:

```typescript
const handlePaste = async (event: ClipboardEvent, kind: 'back' | 'lay') => {
  const items = event.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const blob = item.getAsFile();
      if (blob) {
        // Convert to data URL for preview
        const dataUrl = await blobToDataUrl(blob);
        setPreview(kind, dataUrl);
        
        // Store blob for upload
        setImageBlob(kind, blob);
        
        // Check if both images are ready
        if (bothImagesReady()) {
          triggerAutoParse();
        }
      }
    }
  }
};
```

### Upload Flow

When both images are pasted and auto-parse triggers:

1. Convert clipboard blobs to File objects with generated filenames
2. Upload both to `/api/bets/screenshots` (existing endpoint)
3. Call `/api/bets/autoparse` with both screenshot IDs (existing endpoint)
4. Navigate to review form with parsed data

### Fallback Support

- File drag-and-drop still works alongside paste
- File picker button ("Browse files") available for users who prefer traditional upload
- Mixed mode: paste one, upload the other

### Single Image Mode

If only one image is pasted/uploaded:
- Show a "Parse as Draft" button (not auto-triggered)
- Creates a draft matched bet with only one leg
- User can add the other leg later

## Component Structure

```
/bets/new/page.tsx (server component)
  └── ScreenshotIntakeForm.tsx (client component)
        ├── PasteZone.tsx (reusable, handles paste + drop + preview)
        │     ├── Thumbnail preview
        │     ├── Remove button
        │     └── Loading state
        ├── Auto-parse status indicator
        └── Manual parse button (for single-image drafts)
```

## States

### PasteZone States

1. **Empty**: Shows paste/drop instructions
2. **Hovering**: Highlight border when dragging over
3. **Focused**: Ready to receive paste (after click)
4. **Preview**: Shows thumbnail with remove button
5. **Uploading**: Shows upload progress
6. **Error**: Shows error message with retry

### Form States

1. **Initial**: Both zones empty
2. **Partial**: One image ready
3. **Ready**: Both images ready, auto-parse triggering
4. **Parsing**: Upload + OCR + LLM in progress
5. **Review**: Navigate to review form with parsed data
6. **Error**: Show error, allow retry

## Keyboard Shortcuts

- `Cmd/Ctrl + V`: Paste into focused zone
- `Tab`: Move focus between zones
- `Delete/Backspace`: Remove image from focused zone
- `Enter`: Manual parse trigger (when in partial state)

## Mobile Considerations

- Paste zones stack vertically on mobile
- Tap to focus zone, then paste from mobile clipboard
- Camera icon option to capture directly (future enhancement)

## Error Handling

- Invalid paste content (not an image): "Please paste an image"
- Image too large (>10MB): "Image too large. Maximum size is 10MB"
- Upload failure: "Upload failed. Please try again"
- Parse failure: Show error, keep images, allow retry

## Success Metrics

- Reduce average time from screenshot to parsed review by 50%
- Increase intake completion rate
- Reduce "file not found" errors

## Dependencies

- Browser Clipboard API (widely supported)
- Existing `/api/bets/screenshots` endpoint
- Existing `/api/bets/autoparse` endpoint
- Existing `BetIngestForm` for review

## Out of Scope (Future)

- Direct camera capture on mobile
- Screen recording for live bet tracking
- OCR preview before full parse
- Batch paste (multiple screenshots at once)
