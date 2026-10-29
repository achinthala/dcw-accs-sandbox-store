/*
 * Framework-free renderer for the published mega menu JSON.
 * Used by the EDS `mega-menu` block and by the Admin UI live preview, so both
 * render identical markup. Merchant text is only ever set via textContent.
 *
 * Interaction model (WAI disclosure navigation):
 * - Top-level items with a panel are <button aria-expanded>; the panel holds
 *   a "Shop all" link to the category itself.
 * - Fine pointers open on hover (with intent delay); click/Enter/Space toggle.
 * - Escape closes and returns focus; clicking outside closes.
 * - Below the breakpoint the menu becomes a drawer with drill-down panels.
 */

const ICON_CHEVRON = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_ARROW = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_BACK = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_MENU = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

const OPEN_DELAY = 90;
const CLOSE_DELAY = 180;

let uid = 0;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value === undefined || value === null || value === false) return;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value; // static icons only
    else if (key === 'style') Object.entries(value).forEach(([p, v]) => node.style.setProperty(p, v));
    else node.setAttribute(key, value === true ? '' : value);
  });
  children.flat().filter(Boolean).forEach((child) => node.append(child));
  return node;
}

const BADGE_TONE = {
  new: { background: '#dcfce7', color: '#166534' },
  info: { background: '#dbeafe', color: '#1e40af' },
  sale: { background: 'var(--mm-accent, #d4380d)', color: '#fff' },
  hot: { background: 'linear-gradient(135deg, #ff7a18, #e5195e)', color: '#fff' },
};

function badge(item) {
  if (!item.badge?.text) return null;
  const tone = item.badge.tone || 'new';
  const paint = BADGE_TONE[tone] || BADGE_TONE.new;
  // Inline color wins over the boilerplate `a` and `nav-sections` link rules,
  // which otherwise paint every badge the same brand gray.
  return el('span', {
    class: `mm-badge mm-badge-${tone}`,
    text: item.badge.text,
    style: {
      background: paint.background,
      color: paint.color,
      'text-decoration': 'none',
    },
  });
}

function column(col, index, showViewAll) {
  const list = el(
    'ul',
    { class: 'mm-col-links', id: `mm-col-${uid += 1}` },
    col.links.map((link) => el('li', {}, el('a', { href: link.url, text: link.label }))),
  );
  const title = col.url
    ? el('a', { class: 'mm-col-title', href: col.url, text: col.label })
    : el('span', { class: 'mm-col-title', text: col.label });
  const toggle = col.links.length
    ? el('button', {
      class: 'mm-col-toggle', type: 'button', 'aria-expanded': 'false', 'aria-controls': list.id, 'aria-label': `Show ${col.label} links`, html: ICON_CHEVRON,
    })
    : null;
  const viewAll = showViewAll && col.viewAll
    ? el('a', { class: 'mm-view-all', href: col.viewAll }, el('span', { text: 'View all' }), el('span', { html: ICON_ARROW }))
    : null;
  return el(
    'div',
    { class: 'mm-col', style: { '--mm-i': String(index) } },
    el('div', { class: 'mm-col-head' }, title, toggle),
    col.links.length ? list : null,
    viewAll,
  );
}

function bannerList(item) {
  if (Array.isArray(item.banners) && item.banners.length) return item.banners;
  if (item.promo && (item.promo.title || item.promo.imageUrl || item.promo.text)) return [item.promo];
  return [];
}

function productList(item) {
  return (item.products ?? []).filter((p) => p && p.url && (p.name || p.sku));
}

function promoCard(p, href) {
  if (!p || (!p.title && !p.imageUrl && !p.text)) return null;
  const media = p.imageUrl
    ? el('img', {
      src: p.imageUrl, alt: '', loading: 'lazy', decoding: 'async', width: '640', height: '800',
    })
    : null;
  return el(
    'a',
    { class: `mm-promo${media ? '' : ' mm-promo-plain'}`, href: p.ctaUrl || href },
    media,
    el(
      'span',
      { class: 'mm-promo-body' },
      p.eyebrow ? el('span', { class: 'mm-promo-eyebrow', text: p.eyebrow }) : null,
      p.title ? el('span', { class: 'mm-promo-title', text: p.title }) : null,
      p.text ? el('span', { class: 'mm-promo-text', text: p.text }) : null,
      el('span', { class: 'mm-promo-cta' }, el('span', { text: p.ctaLabel || 'Shop now' }), el('span', { html: ICON_ARROW })),
    ),
  );
}

function banners(item) {
  const cards = bannerList(item).map((b) => promoCard(b, b.ctaUrl || item.url)).filter(Boolean);
  return cards.length ? el('div', { class: 'mm-banners' }, cards) : null;
}

function products(item) {
  const list = productList(item);
  if (!list.length) return null;
  return el(
    'div',
    { class: 'mm-products' },
    list.map((p) => el(
      'a',
      { class: 'mm-product', href: p.url },
      p.imageUrl
        ? el('img', { src: p.imageUrl, alt: '', loading: 'lazy', decoding: 'async', width: '320', height: '320' })
        : el('span', { class: 'mm-product-fallback', 'aria-hidden': 'true' }),
      el('span', { class: 'mm-product-name', text: p.name || p.sku }),
      p.price ? el('span', { class: 'mm-product-price', text: p.price }) : null,
    )),
  );
}

function panel(item, panelId, showViewAll) {
  const bannerRail = banners(item);
  const productRow = products(item);
  const cols = (item.children ?? []).map((col, i) => column(col, i, showViewAll));
  const head = el(
    'div',
    { class: 'mm-panel-head' },
    el(
      'a',
      { class: 'mm-shop-all', href: item.url },
      el('span', { text: `Shop all ${item.label}` }),
      el('span', { html: ICON_ARROW }),
    ),
  );
  return el('div', {
    class: 'mm-panel', id: panelId, 'data-layout': item.layout, style: { '--mm-cols': String(item.columns || 4) },
  }, el(
    'div',
    { class: `mm-panel-inner${bannerRail ? ' mm-has-aside' : ''}` },
    el('div', { class: 'mm-panel-main' }, head, cols.length ? el('div', { class: 'mm-columns' }, cols) : null),
    bannerRail,
    productRow,
  ));
}

function topItem(item, showViewAll) {
  const hasPanel = item.layout !== 'link' && (
    (item.children?.length > 0) || bannerList(item).length > 0 || productList(item).length > 0
  );
  const classes = ['mm-item', hasPanel && 'mm-has-panel', item.highlight && 'mm-highlight'].filter(Boolean).join(' ');
  const label = [el('span', { class: 'mm-label', text: item.label }), badge(item)];

  if (!hasPanel) {
    return el('li', { class: classes }, el('a', { class: 'mm-top', href: item.url }, label));
  }

  uid += 1;
  const panelId = `mm-panel-${uid}`;
  const trigger = el('button', {
    class: 'mm-top', type: 'button', 'aria-expanded': 'false', 'aria-controls': panelId,
  }, label, el('span', { class: 'mm-chevron', html: ICON_CHEVRON }));
  return el('li', { class: classes }, trigger, panel(item, panelId, showViewAll));
}

/**
 * Renders the menu into `root` and wires up interactions.
 * @param {Element} root container to render into (its children are replaced)
 * @param {object} menu published menu JSON from the storefront-menu action
 * @param {{
 *   breakpoint?: number, title?: string, label?: string, forceMobile?: boolean,
 *   embedded?: boolean, anchor?: Element
 * }} [options] `embedded`: the host header owns the hamburger/drawer, so on
 *   mobile the menu renders inline (drill-down only) and on desktop panels are
 *   fixed full-width under `anchor` (e.g. the header).
 * @returns {{ destroy: () => void, close: () => void }}
 */
export function renderMegaMenu(root, menu, options = {}) {
  const breakpoint = options.breakpoint ?? 900;
  const showViewAll = menu.settings?.showViewAll !== false;
  const drawerId = `mm-drawer-${uid += 1}`;

  const bar = el('ul', { class: 'mm-bar' }, menu.items.map((item) => topItem(item, showViewAll)));
  const back = el('button', {
    class: 'mm-back', type: 'button', hidden: true, html: ICON_BACK,
  }, el('span', { text: 'Back' }));
  const drawerTitle = el('span', { class: 'mm-drawer-title', text: options.title || 'Menu' });
  const close = el('button', {
    class: 'mm-close', type: 'button', 'aria-label': 'Close menu', html: ICON_CLOSE,
  });
  const drawer = el(
    'div',
    { class: 'mm-drawer', id: drawerId },
    el('div', { class: 'mm-drawer-head' }, back, drawerTitle, close),
    bar,
  );
  const toggle = el('button', {
    class: 'mm-toggle', type: 'button', 'aria-expanded': 'false', 'aria-controls': drawerId, 'aria-label': 'Open menu', html: ICON_MENU,
  });
  const scrim = el('div', { class: 'mm-scrim', 'aria-hidden': 'true' });
  const nav = el('nav', {
    class: 'mm', 'aria-label': options.label || 'Main', style: { '--mm-accent': menu.settings?.accentColor || '#d4380d' },
  }, toggle, drawer, scrim);

  root.replaceChildren(nav);

  const mq = window.matchMedia(`(width < ${breakpoint}px)`);
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const isMobile = () => options.forceMobile || mq.matches;
  nav.classList.toggle('mm-mobile', isMobile());
  // Admin preview: show the mobile drawer inline instead of as an overlay.
  if (options.forceMobile) nav.classList.add('mm-inline', 'mm-drawer-open');
  // Embedded in a header that has its own drawer: always "open" on mobile.
  const syncEmbedded = () => {
    if (options.embedded) nav.classList.toggle('mm-drawer-open', isMobile());
  };
  if (options.embedded) nav.classList.add('mm-embedded');
  syncEmbedded();

  let openItem = null;
  let timer = null;

  const setOpen = (li, open) => {
    if (!li) return;
    li.classList.toggle('mm-open', open);
    li.querySelector(':scope > .mm-top')?.setAttribute('aria-expanded', String(open));
  };

  const closeAll = () => {
    clearTimeout(timer);
    setOpen(openItem, false);
    openItem = null;
    nav.classList.remove('mm-panel-open', 'mm-drilled');
    back.hidden = true;
    drawerTitle.textContent = options.title || 'Menu';
  };

  const openPanel = (li) => {
    clearTimeout(timer);
    if (openItem === li) return;
    setOpen(openItem, false);
    openItem = li;
    setOpen(li, true);
    nav.classList.add('mm-panel-open');
    // Dim only the page below the bar (or anchor), not the rest of the header.
    const edge = (options.anchor || nav).getBoundingClientRect().bottom;
    nav.style.setProperty('--mm-scrim-top', `${Math.max(0, edge)}px`);
    if (isMobile()) {
      nav.classList.add('mm-drilled');
      back.hidden = false;
      drawerTitle.textContent = li.querySelector('.mm-label')?.textContent || '';
      drawer.scrollTop = 0;
    }
  };

  const setDrawer = (open) => {
    nav.classList.toggle('mm-drawer-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('mm-lock', open && isMobile() && !options.forceMobile);
    if (!open) closeAll();
    else close.focus();
  };

  const onClick = (event) => {
    const trigger = event.target.closest('.mm-top[aria-controls]');
    if (trigger) {
      const li = trigger.parentElement;
      if (openItem === li && !isMobile()) closeAll();
      else openPanel(li);
      return;
    }
    const colToggle = event.target.closest('.mm-col-toggle');
    if (colToggle) {
      const expanded = colToggle.getAttribute('aria-expanded') === 'true';
      colToggle.setAttribute('aria-expanded', String(!expanded));
      colToggle.closest('.mm-col').classList.toggle('mm-col-open', !expanded);
      return;
    }
    if (event.target.closest('a')) closeAll();
  };

  const onOver = (event) => {
    if (isMobile() || !finePointer.matches) return;
    const li = event.target.closest('.mm-item');
    if (!li || !bar.contains(li)) return;
    clearTimeout(timer);
    if (li.classList.contains('mm-has-panel')) {
      timer = setTimeout(() => openPanel(li), openItem ? 0 : OPEN_DELAY);
    } else if (openItem) {
      timer = setTimeout(closeAll, CLOSE_DELAY);
    }
  };

  const onLeave = () => {
    if (isMobile() || !finePointer.matches) return;
    clearTimeout(timer);
    timer = setTimeout(closeAll, CLOSE_DELAY);
  };

  const onKey = (event) => {
    if (event.key !== 'Escape') return;
    if (openItem) {
      const trigger = openItem.querySelector(':scope > .mm-top');
      if (isMobile()) {
        closeAll();
      } else {
        closeAll();
        trigger?.focus();
      }
    } else if (nav.classList.contains('mm-drawer-open')) {
      setDrawer(false);
      toggle.focus();
    }
  };

  const onDocClick = (event) => {
    if (!nav.contains(event.target) && !isMobile()) closeAll();
  };

  const onFocusOut = (event) => {
    if (!isMobile() && openItem && !openItem.contains(event.relatedTarget)) {
      if (!bar.contains(event.relatedTarget)) closeAll();
    }
  };

  const onBreakpoint = () => {
    if (options.forceMobile) return;
    closeAll();
    setDrawer(false);
    nav.classList.toggle('mm-mobile', isMobile());
    syncEmbedded();
  };

  bar.addEventListener('click', onClick);
  bar.addEventListener('mouseover', onOver);
  bar.addEventListener('mouseleave', onLeave);
  bar.addEventListener('focusout', onFocusOut);
  nav.addEventListener('keydown', onKey);
  scrim.addEventListener('click', () => (isMobile() ? setDrawer(false) : closeAll()));
  toggle.addEventListener('click', () => setDrawer(true));
  close.addEventListener('click', () => { setDrawer(false); toggle.focus(); });
  back.addEventListener('click', () => {
    const trigger = openItem?.querySelector(':scope > .mm-top');
    closeAll();
    trigger?.focus();
  });
  document.addEventListener('click', onDocClick);
  mq.addEventListener('change', onBreakpoint);

  return {
    close: closeAll,
    destroy() {
      clearTimeout(timer);
      document.removeEventListener('click', onDocClick);
      mq.removeEventListener('change', onBreakpoint);
      document.body.classList.remove('mm-lock');
      nav.remove();
    },
  };
}
