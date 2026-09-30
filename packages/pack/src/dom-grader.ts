// Runs a problem's declarative checks against rendered documents. Works in any
// DOM: the game's sandboxed iframe, or jsdom in tests. Synchronous and free of
// third-party code: accessibility-engine results (`axe` checks) are computed by
// the host beforehand and passed in.
import type { DomCheck } from "./schema.ts";
import { accessibleName, computedRole, isHidden } from "./a11y.ts";
import { isValidDatetime } from "./datetime.ts";

export { accessibleName, computedRole } from "./a11y.ts";
export { isValidDatetime } from "./datetime.ts";

export interface CheckResult {
  id: string;
  says: string;
  pass: boolean;
  detail?: string;
}

// One violation reported by the host's accessibility engine for one rule.
export interface AxeFinding {
  rule: string;
  help: string;
  // CSS selectors of the offending elements, as the engine reports them.
  targets: string[];
}

// A rendered page of the site being graded.
export interface GradedPage {
  id: string;
  // Where the page is served, e.g. "/letter.html". Relative links resolve against it.
  path: string;
  doc: Document;
  // Findings per axe rule id, for every rule the checks name. A rule missing here was not run.
  axe?: Record<string, AxeFinding[]>;
}

// Other files on the site: a path, and the fragment ids inside it if it is a page.
export interface SiteEntry {
  path: string;
  ids?: string[];
}

export interface GradeOptions {
  files?: SiteEntry[];
}

// Puts the player's CSS into their HTML as a <style> element, keeping the doctype
// and everything else they wrote exactly as written.
export function composeDocument(html: string, css: string): string {
  if (!css.trim()) return html;
  const style = `<style data-knowrld>\n${css}\n</style>`;
  const i = html.search(/<\/head>/i);
  return i >= 0 ? html.slice(0, i) + style + html.slice(i) : html + style;
}

// Compares computed values by letting the browser normalise the expected value too,
// so "red" matches "rgb(255, 0, 0)" and "0" matches "0px".
function sameComputed(doc: Document, el: Element, property: string, expected: string): { ok: boolean; actual: string } {
  const view = doc.defaultView!;
  const actual = view.getComputedStyle(el).getPropertyValue(property).trim();
  const probe = doc.createElement(el.tagName);
  probe.style.setProperty(property, expected);
  (doc.body ?? doc.documentElement).appendChild(probe);
  const normal = view.getComputedStyle(probe).getPropertyValue(property).trim();
  probe.remove();
  return { ok: actual === normal || actual === expected, actual };
}

const short = (t: string) => `"${t.replace(/\s+/g, " ").trim().slice(0, 40)}"`;
const tag = (el: Element) => `<${el.tagName.toLowerCase()}>`;

function textFails(t: string, test: { matches?: string; not?: string }, what: string): string | undefined {
  if (test.matches !== undefined && !new RegExp(test.matches, "i").test(t)) return `${what} ${short(t)} does not fit`;
  if (test.not !== undefined && new RegExp(test.not, "i").test(t)) return `${what} ${short(t)} is not allowed`;
  return undefined;
}

// The next sibling that is an element or non-blank text, skipping comments and whitespace.
function nextMeaningful(n: Node): Node | null {
  let s = n.nextSibling;
  while (s && ((s.nodeType === 3 && !/\S/.test(s.nodeValue ?? "")) || s.nodeType === 8)) s = s.nextSibling;
  return s;
}

const HEADING = /^H([1-6])$/;
function headingLevel(el: Element): number {
  const m = HEADING.exec(el.tagName);
  if (m) return Number(m[1]);
  return Number(el.getAttribute("aria-level") ?? 2) || 2;
}

const ORIGIN = "https://site.invalid";

type Target = { page?: string; to?: string };

function resolveHref(href: string, page: GradedPage, pages: GradedPage[], files: SiteEntry[], want: Target): string | undefined {
  let url: URL;
  try {
    url = new URL(href.trim(), ORIGIN + page.path);
  } catch {
    return `href="${href}" is not a valid URL`;
  }
  if (url.origin !== ORIGIN) return `href="${href}" leads off this site`;
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    path = url.pathname;
  }
  // A directory URL serves its index.html; MDN treats "projects" and "projects/" alike.
  const candidates = path.endsWith("/") ? [path + "index.html"] : [path, path + "/index.html"];
  const inPage = pages.find((p) => candidates.includes(p.path));
  const inFile = files.find((f) => candidates.includes(f.path));
  if (!inPage && !inFile) return `href="${href}" leads to ${path}, which is not on the site`;
  if (want.page !== undefined && inPage?.id !== want.page) {
    const goal = pages.find((p) => p.id === want.page);
    return `href="${href}" leads to ${path}, not to ${goal?.path ?? want.page}`;
  }
  if (!url.hash && !href.includes("#")) return want.to ? `href="${href}" has no #fragment` : undefined;
  let frag = url.hash.slice(1);
  try {
    frag = decodeURIComponent(frag);
  } catch {
    // Keep the raw fragment.
  }
  if (frag === "") return `href="${href}" is an empty fragment that goes nowhere`;
  const where = inPage ? inPage.path : inFile!.path;
  if (inPage) {
    const el = [...inPage.doc.querySelectorAll("[id]")].find((e) => e.getAttribute("id") === frag);
    if (el) {
      if (want.to && !el.matches(want.to)) return `href="${href}" leads to ${tag(el)}, expected ${want.to}`;
      return undefined;
    }
  } else if ((inFile!.ids ?? []).includes(frag)) {
    return want.to ? `href="${href}" cannot be checked against ${want.to}` : undefined;
  }
  // The HTML standard sends "#top" to the top of the page even without such an id.
  if (frag.toLowerCase() === "top" && !want.to) return undefined;
  return `href="${href}": no element has id="${frag}" on ${where}`;
}

const NOT_TEXT = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"]);

// Rendered as far as the DOM can tell: no hidden attribute on it or an ancestor, and no computed
// display: none (on it or an ancestor) or visibility: hidden. Unlike isHidden, aria-hidden does not
// count: aria-hidden content is still on screen.
export function isRendered(el: Element): boolean {
  if (el.closest("[hidden]")) return false;
  const view = el.ownerDocument.defaultView;
  try {
    for (let e: Element | null = el; e; e = e.parentElement) {
      const s = view?.getComputedStyle(e);
      if (s && (s.display === "none" || (e === el && s.visibility === "hidden"))) return false;
    }
  } catch {
    // No computed styles in this DOM; attributes alone decide.
  }
  return true;
}

// An element's text, without the contents of script, style, template and noscript, and with
// `rendered`, without anything hidden. With `own`, only its own text nodes.
export function textOf(el: Element, opts: { own?: boolean; rendered?: boolean } = {}): string {
  let out = "";
  for (const n of el.childNodes) {
    if (n.nodeType === 3) out += n.nodeValue ?? "";
    else if (n.nodeType === 1 && !opts.own) {
      const c = n as Element;
      if (NOT_TEXT.has(c.tagName.toUpperCase())) continue;
      if (opts.rendered && !isRendered(c)) continue;
      out += textOf(c, opts);
    }
  }
  return out;
}

// The heading's parent in the outline: the nearest earlier visible heading of a higher rank.
function parentHeading(el: Element): Element | null | undefined {
  const all = [...el.ownerDocument.querySelectorAll("h1, h2, h3, h4, h5, h6, [role=heading]")].filter((h) => !isHidden(h));
  const i = all.indexOf(el);
  if (i < 0) return undefined;
  const level = headingLevel(el);
  for (let j = i - 1; j >= 0; j--) if (headingLevel(all[j]!) < level) return all[j]!;
  return null;
}

function outlineFails(el: Element, start: number | undefined): string | undefined {
  const heads = [...el.querySelectorAll("h1, h2, h3, h4, h5, h6, [role=heading]")].filter((h) => !isHidden(h));
  const levels = heads.map(headingLevel);
  if (start !== undefined) {
    if (!heads.length) return "has no headings";
    if (levels[0] !== start) return `the first heading is h${levels[0]} ${short(heads[0]!.textContent ?? "")}, not h${start}`;
  }
  for (let i = 1; i < heads.length; i++) {
    if (levels[i]! > levels[i - 1]! + 1) {
      return `h${levels[i - 1]} ${short(heads[i - 1]!.textContent ?? "")} is followed by h${levels[i]} ${short(heads[i]!.textContent ?? "")}, skipping a level`;
    }
  }
  return undefined;
}

function nextFails(el: Element, steps: NonNullable<DomCheck["next"]>): string | undefined {
  let at: Node = el;
  for (const step of steps) {
    const s = nextMeaningful(at);
    const fits =
      s !== null &&
      s.nodeType === 1 &&
      (step.is === undefined || (s as Element).matches(step.is)) &&
      (step.text === undefined || !textFails(s.textContent ?? "", step.text, "text"));
    if (step.absent) return fits ? `is followed by ${tag(s as Element)} ${short(s!.textContent ?? "")}` : undefined;
    if (!fits) {
      const what = s === null ? "nothing" : s.nodeType === 1 ? `${tag(s as Element)} ${short(s.textContent ?? "")}` : `text ${short(s.nodeValue ?? "")}`;
      return `is followed by ${what}, expected ${step.is ?? "an element"}${step.text?.matches ? ` matching /${step.text.matches}/` : ""}`;
    }
    at = s!;
  }
  return undefined;
}

function select(c: DomCheck, doc: Document): Element[] | string {
  let els: Element[];
  try {
    els = [...doc.querySelectorAll(c.selector ?? "*")];
  } catch {
    return `the check's selector ${c.selector} is invalid`;
  }
  if (c.within) els = els.filter((e) => e.parentElement?.closest(c.within!));
  if (c.role) els = els.filter((e) => computedRole(e) === c.role);
  if (c.rendered) els = els.filter(isRendered);
  return els;
}

// Grades one check against the elements it selected. `owner` maps each element to its page.
function assess(
  c: DomCheck,
  els: Element[],
  owner: (el: Element) => GradedPage,
  pages: GradedPage[],
  files: SiteEntry[],
): { pass: boolean; detail?: string } {
  if (c.first) {
    const firstIn = new Map<Document, Element>();
    for (const e of els) if (!firstIn.has(e.ownerDocument)) firstIn.set(e.ownerDocument, e);
    els = [...firstIn.values()];
  }
  const max = c.count?.max ?? Infinity;
  // At least one by default, unless the check allows none (count: { max: 0 } means "no such element").
  const min = c.count?.min ?? Math.min(1, max);
  if (els.length < min) return { pass: false, detail: `found ${els.length}, need at least ${min}` };
  if (els.length > max) return { pass: false, detail: `found ${els.length}, allowed at most ${max}` };

  if (c.unique) {
    const seen = new Set<string>();
    for (const el of els) {
      const v = c.unique === "text" ? (el.textContent ?? "").replace(/\s+/g, " ").trim() : el.getAttribute(c.unique);
      if (v === null) continue;
      if (seen.has(v)) return { pass: false, detail: c.unique === "text" ? `text ${short(v)} appears more than once` : `${c.unique}="${v}" appears more than once` };
      seen.add(v);
    }
  }
  if (els.length === 0) return { pass: true };

  const test = (el: Element): string | undefined => {
    const doc = el.ownerDocument;
    if (c.attr) {
      const v = el.getAttribute(c.attr.name);
      if (c.attr.present === false && v !== null) return `has a ${c.attr.name} attribute`;
      if (c.attr.present !== false && v === null) return `has no ${c.attr.name} attribute`;
      if (v !== null && c.attr.equals !== undefined && v !== c.attr.equals) return `${c.attr.name}="${v}"`;
      if (v !== null && c.attr.matches !== undefined && !new RegExp(c.attr.matches, "i").test(v)) {
        return `${c.attr.name}="${v}" does not fit`;
      }
    }
    if (c.text) {
      const why = textFails(textOf(el, { own: c.text.own, rendered: c.rendered }), c.text, "text");
      if (why) return why;
    }
    if (c.under) {
      const parent = parentHeading(el);
      if (parent === undefined) return "is not a visible heading";
      if (parent === null) return "has no heading of a higher rank before it";
      const why = textFails(parent.textContent ?? "", c.under, `sits under ${tag(parent)}, whose text`);
      if (why) return why;
    }
    if (c.name) {
      const why = textFails(accessibleName(el), c.name, "its accessible name");
      if (why) return why;
    }
    if (c.datetime) {
      const attr = el.getAttribute("datetime");
      if (attr === null && el.children.length) return "has no datetime attribute, so it may not contain elements";
      const v = attr ?? el.textContent ?? "";
      if (!isValidDatetime(v)) return `${attr === null ? "text" : "datetime"} "${v.trim().slice(0, 40)}" is not a valid date or time`;
    }
    if (c.outline) {
      const why = outlineFails(el, c.outline.start);
      if (why) return why;
    }
    if (c.next) {
      const why = nextFails(el, c.next);
      if (why) return why;
    }
    if (c.precedes) {
      let later: Element[];
      try {
        later = [...doc.querySelectorAll(c.precedes)];
      } catch {
        return `the check's selector ${c.precedes} is invalid`;
      }
      // Node.DOCUMENT_POSITION_FOLLOWING is 4: every match must follow the element.
      const before = later.find((o) => o !== el && !(el.compareDocumentPosition(o) & 4));
      if (before) return `comes after ${tag(before)} ${short(before.textContent ?? "")}`;
    }
    if (c.resolves) {
      const href = el.getAttribute("href");
      if (href === null) return "has no href";
      const why = resolveHref(href, owner(el), pages, files, c.resolves === true ? {} : c.resolves);
      if (why) return why;
    }
    if (c.style) {
      const { ok, actual } = sameComputed(doc, el, c.style.property, c.style.equals);
      if (!ok) return `${c.style.property} is ${actual || "unset"}`;
    }
    return undefined;
  };

  const where = (el: Element) => (pages.length > 1 ? ` on ${owner(el).path}` : "");
  if (c.every) {
    for (const el of els) {
      const why = test(el);
      if (why) return { pass: false, detail: `${tag(el)}${where(el)} ${why}` };
    }
    return { pass: true };
  }
  const reasons = els.map(test);
  if (reasons.some((r) => r === undefined)) return { pass: true };
  return { pass: false, detail: `${tag(els[0]!)}${where(els[0]!)} ${reasons[0]}` };
}

function runAxe(c: DomCheck, page: GradedPage): { pass: boolean; detail?: string } {
  const missing = c.axe!.filter((r) => !page.axe?.[r]);
  if (missing.length) return { pass: false, detail: `the accessibility audit did not run ${missing.join(", ")}` };
  const found = c.axe!.flatMap((r) => page.axe![r]!);
  if (!found.length) return { pass: true };
  const f = found[0]!;
  return { pass: false, detail: `${f.rule}: ${f.help} (${f.targets.slice(0, 2).join(", ")})` };
}

function runOnPage(c: DomCheck, page: GradedPage, pages: GradedPage[], files: SiteEntry[]): { pass: boolean; detail?: string } {
  const where = pages.length > 1 ? ` on ${page.path}` : "";
  if (c.doctype && page.doc.doctype?.name.toLowerCase() !== "html") return { pass: false, detail: `no <!doctype html> at the top${where}` };
  if (c.axe) {
    const r = runAxe(c, page);
    if (!r.pass) return { pass: false, detail: r.detail + where };
  }
  if (!c.selector && !c.role) return { pass: true };
  const els = select(c, page.doc);
  if (typeof els === "string") return { pass: false, detail: els };
  return assess(c, els, () => page, pages, files);
}

// Grades checks against a site of one or more pages. A check runs on each of its `pages`
// (default: all) and passes only if it passes on each; a `pooled` check selects across them at once.
export function gradeSite(pages: GradedPage[], checks: DomCheck[], opts: GradeOptions = {}): CheckResult[] {
  const files = opts.files ?? [];
  return checks.map((c) => {
    const on = c.pages ? pages.filter((p) => c.pages!.includes(p.id)) : pages;
    const base = { id: c.id, says: c.says };
    if (c.pages && on.length !== c.pages.length) {
      return { ...base, pass: false, detail: "the check names a page that is not in this problem" };
    }
    if (c.pooled) {
      const owner = new Map<Element, GradedPage>();
      const els: Element[] = [];
      for (const p of on) {
        const got = select(c, p.doc);
        if (typeof got === "string") return { ...base, pass: false, detail: got };
        for (const e of got) owner.set(e, p);
        els.push(...got);
      }
      return { ...base, ...assess(c, els, (e) => owner.get(e)!, pages, files) };
    }
    for (const p of on) {
      const r = runOnPage(c, p, pages, files);
      if (!r.pass) return { ...base, ...r };
    }
    return { ...base, pass: true };
  });
}

// Grades one document on its own, as the page /index.html (or `path`) of a site with the given files.
export function gradeDocument(
  doc: Document,
  checks: DomCheck[],
  opts: GradeOptions & { path?: string; axe?: Record<string, AxeFinding[]> } = {},
): CheckResult[] {
  return gradeSite([{ id: "index", path: opts.path ?? "/index.html", doc, axe: opts.axe }], checks, opts);
}
