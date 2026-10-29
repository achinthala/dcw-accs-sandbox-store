# Mega Menu Block

## Overview

Renders the store's mega menu from the **Mega Menu** App Builder app (`app-builder/megamenu`). Merchants build and publish the menu in Commerce Admin under **Content > Mega Menu**, and this block renders the published JSON. It shows full-width dropdown panels on desktop and a drill-down list on mobile, and it is keyboard accessible.

The header uses it automatically when `mega-menu-endpoint` is set in `config.json`. In that case the authored nav sections are hidden and stay available as the fallback. The block can also be authored on a page.

## Integration

### Block Configuration

| Configuration Key | Type | Default | Description | Required | Side Effects |
|-------------------|------|---------|-------------|----------|--------------|
| `endpoint` | string | `mega-menu-endpoint` from config | `storefront-menu` action URL | No | Without an endpoint, the block hides itself |
| `store-view` | string | `headers.cs.Magento-Store-View-Code` | Store view whose menu is loaded | No | |

Header integration: `config.json` → `public.default["mega-menu-endpoint"]`.

### URL Parameters

None read. The block sends `store_view` and `group_hash` to the endpoint.

### Local Storage

- `sessionStorage["mega-menu:?store_view=…&group_hash=…"]`: cached menu, ETag and timestamp. Fresh for 5 minutes, then revalidated with `If-None-Match`.

### Events

#### Event Listeners

- `events.on('auth/group-uid', callback, { eager: true })`: the shopper's customer group hash. The menu reloads for that group on sign-in or sign-out, so B2B and group-specific items appear.

#### Event Emitters

None.

## Behavior Patterns

### Page Context Detection

- **Desktop (≥ 900px)**: top-level bar. Items with sub-categories open a full-width panel under the header (on hover or click) with columns, "View all" links and an optional promo card.
- **Mobile (< 900px)**: renders inside the header's hamburger drawer. Tapping an item drills into its panel, and **Back** returns.

### User Interaction Flows

1. **Browse**: hover or click a top item, pick a column heading or link. Escape or clicking outside closes the panel.
2. **Shop all**: each panel starts with a "Shop all <category>" link.

### Error Handling

- **Endpoint unreachable or no published menu (404)**: the authored nav sections stay visible (header) or the block hides itself (authored).
- **Stale data**: a cached menu renders immediately while a background request refreshes it.
