/**
 * Element the header should treat as the mega menu: the EDS block wrapper when
 * present, otherwise the block itself. Moving only the block leaves an empty
 * `.mega-menu-wrapper` section behind. The header then labels that empty
 * section `.nav-sections` and the da.live list never becomes the nav.
 * @param {Element} block
 */
function movableHost(block) {
  const parent = block.parentElement;
  if (parent?.classList.contains("mega-menu-wrapper")) return parent;
  return block;
}

/**
 * Puts the mega menu block in front of the da.live link list.
 * The Commerce header labels the first three nav sections brand, sections, and
 * tools, so an extra section would steal those slots. This moves the block
 * into the section that already holds the authored list and drops the empty
 * section it came from.
 * @param {Element} block mega menu block
 * @returns {boolean} true when a da.live list was found and the block now precedes it
 */
export function placeBeforeDaNav(block) {
  if (!block || block.closest("main")) return false;
  const section = block.closest(".section");
  const root = section?.parentElement;
  if (!root) return false;

  const list = [...root.querySelectorAll("ul")].find(
    (ul) => !ul.closest(".mega-menu") && ul.querySelector(":scope > li"),
  );
  if (!list) return false;

  const listSection = list.closest(".section");
  const wrapper = list.closest(".default-content-wrapper") || list;
  const host = wrapper.parentElement;
  if (!host) return false;

  const moving = movableHost(block);
  if (moving.parentElement !== host || moving.nextElementSibling !== wrapper) {
    host.insertBefore(moving, wrapper);
  }
  if (section && listSection && section !== listSection) {
    section.querySelectorAll(":scope > .mega-menu-wrapper").forEach((wrap) => {
      if (wrap.childElementCount === 0) wrap.remove();
    });
    // The Commerce header needs three sections: brand, this link list, and
    // tools. The tools section is often empty in da.live (cart and search are
    // injected later). Only drop a section when it was an extra one created
    // for this block, never the third section itself.
    const sections = root.querySelectorAll(":scope > .section");
    if (section.childElementCount === 0 && sections.length > 3) section.remove();
  }
  return true;
}
