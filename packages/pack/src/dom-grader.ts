// Runs a problem's declarative checks against a rendered document. Works in any
// DOM: the game's sandboxed iframe, or jsdom in tests.
import type { DomCheck } from "./schema.ts";

export interface CheckResult {
  id: string;
  says: string;
  pass: boolean;
  detail?: string;
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

function runOne(doc: Document, c: DomCheck): { pass: boolean; detail?: string } {
  if (c.doctype) {
    if (doc.doctype?.name.toLowerCase() !== "html") return { pass: false, detail: "no <!doctype html> at the top" };
    if (!c.selector) return { pass: true };
  }
  let els: Element[];
  try {
    els = [...doc.querySelectorAll(c.selector!)];
  } catch {
    return { pass: false, detail: `the check's selector ${c.selector} is invalid` };
  }
  if (c.within) els = els.filter((e) => e.parentElement?.closest(c.within!));

  const min = c.count?.min ?? 1;
  const max = c.count?.max ?? Infinity;
  if (els.length < min) return { pass: false, detail: `found ${els.length}, need at least ${min}` };
  if (els.length > max) return { pass: false, detail: `found ${els.length}, allowed at most ${max}` };
  if (els.length === 0) return { pass: true };

  const test = (el: Element): string | undefined => {
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
      const t = el.textContent ?? "";
      const shown = `"${t.trim().slice(0, 40)}"`;
      if (c.text.matches !== undefined && !new RegExp(c.text.matches, "i").test(t)) return `text ${shown} does not fit`;
      if (c.text.not !== undefined && new RegExp(c.text.not, "i").test(t)) return `text ${shown} is not allowed`;
    }
    if (c.style) {
      const { ok, actual } = sameComputed(doc, el, c.style.property, c.style.equals);
      if (!ok) return `${c.style.property} is ${actual || "unset"}`;
    }
    return undefined;
  };

  if (c.every) {
    for (const el of els) {
      const why = test(el);
      if (why) return { pass: false, detail: `<${el.tagName.toLowerCase()}> ${why}` };
    }
    return { pass: true };
  }
  const reasons = els.map(test);
  if (reasons.some((r) => r === undefined)) return { pass: true };
  return { pass: false, detail: reasons[0] };
}

export function gradeDocument(doc: Document, checks: DomCheck[]): CheckResult[] {
  return checks.map((c) => ({ id: c.id, says: c.says, ...runOne(doc, c) }));
}
