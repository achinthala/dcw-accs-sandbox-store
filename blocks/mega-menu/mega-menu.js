/*
 * Mega Menu block for the Adobe Commerce boilerplate (Edge Delivery Services).
 *
 * Two ways to use it:
 * 1. From blocks/header/header.js (recommended, no authoring):
 *      loadMegaMenu(container, { endpoint, storeView, embedded: true, anchor })
 *    with the endpoint stored in config.json as "mega-menu-endpoint".
 * 2. As an authored block in a page or the nav document:
 *      | Mega Menu  |                                             |
 *      | Endpoint   | https://<ns>.adobeioruntime.net/api/v1/web/megamenu/storefront-menu |
 *      | Store View | default                                     |
 *
 * The customer group comes from the auth drop-in (`auth/group-uid`, a SHA-1
 * hash), so signed-in and B2B shoppers get their group's menu.
 */
import { events } from '@dropins/tools/event-bus.js';
import { getConfigValue, getHeaders } from '@dropins/tools/lib/aem/configs.js';
import { readBlockConfig } from '../../scripts/aem.js';
import { renderMegaMenu } from './mega-menu-render.js';

const CACHE_PREFIX = 'mega-menu:';
const FRESH_MS = 5 * 60 * 1000;
const GUEST_GROUP_HASH = 'b6589fc6ab0dc82cf12099d1c2d40ab994e8410c'; // sha1("0")

function readCache(key) {
  try {
    return JSON.parse(sessionStorage.getItem(key));
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or disabled: the menu still renders from the network.
  }
}

async function fetchMenu(url, cached) {
  const headers = cached?.etag ? { 'If-None-Match': cached.etag } : {};
  const response = await fetch(url, { headers });
  if (response.status === 304 && cached) return { ...cached, at: Date.now() };
  if (!response.ok) throw new Error(`Mega menu request failed: ${response.status}`);
  return { menu: await response.json(), etag: response.headers.get('ETag'), at: Date.now() };
}

export function defaultStoreView() {
  return getHeaders('cs')?.['Magento-Store-View-Code']
    || getConfigValue('analytics.store-view-code')
    || 'default';
}

/**
 * Loads the published menu and renders it into `container`. Renders instantly
 * from the session cache, revalidates in the background, and re-renders when
 * the shopper's customer group changes (sign in / sign out).
 * @param {Element} container
 * @param {{ endpoint: string, storeView?: string, embedded?: boolean,
 *   anchor?: Element, breakpoint?: number }} options
 * @returns {Promise<boolean>} true when a menu was rendered
 */
export async function loadMegaMenu(container, {
  endpoint, storeView = defaultStoreView(), embedded = false, anchor, breakpoint = 900,
} = {}) {
  if (!endpoint) return false;
  container.classList.add('mega-menu');

  let rendered = null;
  let shownVersion = null;
  let groupHash = GUEST_GROUP_HASH;

  const show = (menu) => {
    rendered?.destroy();
    rendered = renderMegaMenu(container, menu, { breakpoint, embedded, anchor });
    shownVersion = `${menu.version}-${menu.customerGroup}`;
  };

  const load = async () => {
    const url = new URL(endpoint, window.location.href);
    url.searchParams.set('store_view', storeView);
    url.searchParams.set('group_hash', groupHash);
    const key = CACHE_PREFIX + url.search;
    const cached = readCache(key);

    if (cached?.menu) {
      if (shownVersion !== `${cached.menu.version}-${cached.menu.customerGroup}`) show(cached.menu);
      if (Date.now() - cached.at < FRESH_MS) return true;
    }

    try {
      const fresh = await fetchMenu(url, cached);
      writeCache(key, fresh);
      if (shownVersion !== `${fresh.menu.version}-${fresh.menu.customerGroup}`) show(fresh.menu);
      return true;
    } catch (error) {
      console.warn(error);
      return Boolean(cached?.menu);
    }
  };

  // Eager: receives the last emitted value right away if auth already ran.
  let initial = null;
  events.on('auth/group-uid', (hash) => {
    if (!hash || hash === groupHash) return;
    groupHash = hash;
    if (initial) load();
  }, { eager: true });

  initial = load();
  return initial;
}

/**
 * @param {Element} block the block
 */
export default async function decorate(block) {
  const config = readBlockConfig(block);
  const fallback = [...block.children];
  const ok = await loadMegaMenu(block, {
    endpoint: config.endpoint || getConfigValue('mega-menu-endpoint'),
    storeView: config['store-view'] || defaultStoreView(),
  });
  if (!ok) {
    block.replaceChildren(...fallback);
    block.hidden = true;
  }
}
