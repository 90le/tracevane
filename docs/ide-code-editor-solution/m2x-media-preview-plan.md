# M2.x Media Preview Enhancement Plan

Status: In progress
Branch: `feat/file-manager-media-preview-m2x`
Created: 2026-07-01
Base: `feat/file-manager-file-surface-m2`

## 1. Objective

M2 proved that all files can open in one File Surface. M2.x upgrades the non-text side from "safe fallback preview" to a usable media previewer.

```txt
Image -> draggable infinite canvas + wheel zoom + zoom controls.
Video -> native player plus skip/speed affordances inside File Surface.
Audio -> native player plus skip/speed affordances inside File Surface.
PDF -> dedicated native viewer container now; evaluate focused PDF dependency only when native controls are insufficient.
Binary/unsupported -> safe inspect/download remains.
```

## 2. Reuse-first decision

Current dependency check on 2026-07-01:

| Candidate | Current version | License | Fit |
|---|---:|---|---|
| `react-zoom-pan-pinch` | 4.0.3 | MIT | Good fit for richer image pan/zoom gestures, but not needed for the first small implementation. |
| `@cyntler/react-doc-viewer` | 1.17.1 | Apache-2.0 | Broad document viewer candidate; evaluate later for Office/document formats. |
| `pdfjs-dist` | 6.1.200 | Apache-2.0 | Focused PDF engine; evaluate later if native PDF object preview is insufficient. |

Decision for this slice: **do not add a dependency yet**. Image pan/zoom can be implemented with a small local component and tested selectors. Add `react-zoom-pan-pinch` later only if touch gestures, bounds, inertia, thumbnails, or more complex transforms become product requirements.

## 3. Scope

### In scope

- Image preview canvas:
  - wheel zoom;
  - pointer drag pan;
  - zoom in/out buttons;
  - reset/fit button;
  - rotate button;
  - no page scroll while zooming the image canvas.
- Video preview:
  - native controls;
  - skip backward/forward 10 seconds;
  - playback speed selector;
  - contained black stage.
- Audio preview:
  - native controls;
  - skip backward/forward 10 seconds;
  - playback speed selector.
- PDF preview:
  - dedicated container around native `<object>`/`iframe` fallback.
- Smoke coverage for the above controls and interactions.

### Out of scope

- Office preview.
- Thumbnail strip / gallery navigation.
- EXIF metadata panel.
- OCR / image annotation.
- Full PDF.js viewer toolbar.
- New dependencies without a focused dependency review.

## 4. Acceptance

- Image preview supports wheel zoom and drag pan in the online File Surface.
- Image preview can reset to a fitted 100% view.
- Video/audio previews expose skip and playback speed controls.
- PDF remains readable through the native browser path.
- `smoke:file-manager:media-preview` proves selectors and core interactions.
- `typecheck:web` passes.

## 5. Future candidates

- Add `react-zoom-pan-pinch` if touch/pinch, constrained bounds, or smooth gesture physics are needed.
- Add `pdfjs-dist` or a React PDF viewer only if native PDF preview fails product requirements.
- Add document conversion/viewing only after a separate Office preview threat/performance/license review.
