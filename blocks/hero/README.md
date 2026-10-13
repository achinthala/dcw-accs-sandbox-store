# Hero Block

## Overview

The Hero block is a full-bleed banner used at the top of a page. Authors place a background image and a heading (and optional supporting text) in the block. The image fills the banner and the text sits on top of it. A `dark` variant sets a dark fallback behind the image and light body text so the banner stays readable on dark photography.

The block is styled only. It has no JavaScript.

## Integration

### Block Configuration

Content is authored in a single cell. The Universal Editor model (`blocks/hero/_hero.json`) exposes:

| Field | Effect |
|-------|--------|
| Image | Background picture. It is positioned behind the text and cropped to cover the banner. |
| Alt | Alternative text on the image. |
| Text | Heading rendered as an `h1`, centered and constrained to 1200px. |

Example authoring structure:

```
| Hero |
|------|
| ![Banner](banner.jpg) |
| # Headline |
| Supporting copy |
```

### Variants

Add the `dark` class by authoring the block as **Hero (dark)**.

| Variant | Effect |
|---------|--------|
| (default) | Light heading color (`--background-color`) over the image. The image area has no fallback fill. |
| `dark` | The picture area uses `--color-neutral-900` as a background, and paragraphs use `--color-neutral-50`. |

The heading color is the same in both variants. Only the picture background and paragraph color change for `dark`.

### URL Parameters

No URL parameters affect this block.

### Local Storage

No localStorage keys are used by this block.

### Events

This block does not emit or listen to any custom events.

## Behavior Patterns

### Layout

- The section wrapper drops its max width and padding so the banner spans the page.
- The block is at least 300px tall, with 40px vertical padding and 24px horizontal padding.
- From 900px wide, horizontal padding increases to 32px.
- The picture is absolutely positioned to cover the block (`object-fit: cover`, `z-index: -1`). The heading and any other text sit in normal flow on top.

### User Interaction

1. The banner renders the authored image and text. There are no controls.
2. Links inside the text remain clickable.
3. On a narrow viewport the padding is tighter; from 900px the side padding increases. The image continues to cover the banner.

## Error Handling

- **Missing image**: The banner still reserves its minimum height and shows the text. With the `dark` variant, the picture area stays filled with `--color-neutral-900`.
- **Missing heading or body**: Remaining content is shown. Empty space does not collapse the minimum height.
- **Missing variant class**: The block uses the default (light heading, no dark fill).
