// A small, dependency-free model of how the accessibility tree sees an element: its role
// (HTML-AAM implicit roles for the elements this pack format grades, or an explicit role)
// and its accessible name (a subset of accname 1.2). It covers landmarks, headings, lists,
// links, buttons and images; it is not a full accessibility engine. Hosts that need one run
// axe-core rules through `axe` checks.

// Sectioning content, and elements with the same roles (MDN, <aside> and <header>).
const SECTIONING = "article, aside, nav, section, [role=article], [role=complementary], [role=navigation], [role=region]";
// A header or footer inside these, or inside main, is not the page's banner or contentinfo.
const SCOPES_HEADER = `${SECTIONING}, main, [role=main]`;

// Roles whose name can come from their content (accname 1.2, "name from content").
const NAME_FROM_CONTENT = new Set([
  "button", "cell", "checkbox", "columnheader", "gridcell", "heading", "link", "menuitem",
  "menuitemcheckbox", "menuitemradio", "option", "radio", "row", "rowheader", "switch", "tab",
  "tooltip", "treeitem",
]);

export function isHidden(el: Element): boolean {
  if (el.closest("[hidden], [aria-hidden=true]")) return true;
  const view = el.ownerDocument.defaultView;
  try {
    for (let e: Element | null = el; e; e = e.parentElement) {
      const s = view?.getComputedStyle(e);
      if (s && (s.display === "none" || (e === el && s.visibility === "hidden"))) return true;
    }
  } catch {
    // No computed styles in this DOM; attributes alone decide.
  }
  return false;
}

function scopedTo(el: Element, scopes: string): boolean {
  return !!el.parentElement?.closest(scopes);
}

// The element's role as the accessibility tree reports it. "generic" for elements
// with no role of their own; "none" for decorative images.
export function computedRole(el: Element): string {
  const explicit = el.getAttribute("role")?.trim().split(/\s+/)[0];
  if (explicit) return explicit === "presentation" ? "none" : explicit;
  const t = el.tagName.toLowerCase();
  switch (t) {
    case "a":
    case "area":
      return el.hasAttribute("href") ? "link" : "generic";
    case "article":
      return "article";
    case "aside":
      return scopedTo(el, SECTIONING) && !explicitName(el) ? "generic" : "complementary";
    case "blockquote":
      return "blockquote";
    case "button":
      return "button";
    case "input": {
      const type = (el.getAttribute("type") ?? "text").trim().toLowerCase();
      if (["button", "submit", "reset", "image"].includes(type)) return "button";
      if (type === "checkbox" || type === "radio") return type;
      return type === "hidden" ? "none" : "textbox";
    }
    case "dd":
      return "definition";
    case "dt":
      return "term";
    case "footer":
      return scopedTo(el, SCOPES_HEADER) ? "generic" : "contentinfo";
    case "header":
      return scopedTo(el, SCOPES_HEADER) ? "generic" : "banner";
    case "form":
      return "form";
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return "heading";
    case "hr":
      return "separator";
    case "img":
      return el.getAttribute("alt") === "" ? "none" : "img";
    case "li":
      return el.parentElement?.matches("ul, ol, menu") ? "listitem" : "generic";
    case "main":
      return "main";
    case "nav":
      return "navigation";
    case "ol":
    case "ul":
    case "menu":
      return "list";
    case "p":
      return "paragraph";
    case "search":
      return "search";
    case "section":
      return explicitName(el) ? "region" : "generic";
    default:
      return "generic";
  }
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

// A name given by aria-labelledby or aria-label, the only sources landmarks and sections use.
function explicitName(el: Element, visiting = new Set<Element>()): string {
  const by = el.getAttribute("aria-labelledby");
  if (by && !visiting.has(el)) {
    visiting.add(el);
    const doc = el.ownerDocument;
    const parts = by
      .split(/\s+/)
      .map((id) => doc.getElementById(id))
      .filter((e): e is HTMLElement => !!e)
      .map((e) => contentName(e, visiting, true));
    const joined = squash(parts.join(" "));
    if (joined) return joined;
  }
  const label = el.getAttribute("aria-label");
  if (label && label.trim()) return squash(label);
  return "";
}

// Text from an element's subtree, as accname collects it for name-from-content.
function contentName(el: Element, visiting: Set<Element>, referenced = false): string {
  if (!referenced && isHidden(el)) return "";
  const own = explicitName(el, visiting);
  if (own) return own;
  const t = el.tagName.toLowerCase();
  if (t === "img" || t === "area") return squash(el.getAttribute("alt") ?? "");
  let out = "";
  for (const n of el.childNodes) {
    if (n.nodeType === 3) out += n.nodeValue;
    else if (n.nodeType === 1) {
      const child = n as Element;
      const block = /^(p|div|li|h[1-6]|br|ul|ol|dl|dt|dd)$/i.test(child.tagName);
      out += (block ? " " : "") + contentName(child, visiting) + (block ? " " : "");
    }
  }
  const text = squash(out);
  return text || squash(el.getAttribute("title") ?? "");
}

// The element's accessible name: what a screen reader announces for it.
export function accessibleName(el: Element): string {
  const own = explicitName(el);
  if (own) return own;
  const t = el.tagName.toLowerCase();
  if (t === "img" || t === "area") {
    const alt = el.getAttribute("alt");
    return alt !== null ? squash(alt) : squash(el.getAttribute("title") ?? "");
  }
  if (t === "input") {
    // Button-like inputs are named by their value, or the browser's default label (HTML-AAM).
    const type = (el.getAttribute("type") ?? "").trim().toLowerCase();
    const value = squash(el.getAttribute("value") ?? "");
    if (type === "image") return squash(el.getAttribute("alt") ?? "") || value || squash(el.getAttribute("title") ?? "");
    if (type === "submit") return value || "Submit";
    if (type === "reset") return value || "Reset";
    if (type === "button") return value || squash(el.getAttribute("title") ?? "");
    return squash(el.getAttribute("title") ?? "");
  }
  if (NAME_FROM_CONTENT.has(computedRole(el))) return contentName(el, new Set());
  return squash(el.getAttribute("title") ?? "");
}
