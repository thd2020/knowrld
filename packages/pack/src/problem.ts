// Uniform views of a problem, whether it has one page or several, one list of checks or stages.
import type { DomCheck, Fixture, ProblemFile, SiteFile, Stage } from "./schema.ts";

export interface Code {
  html: string;
  css: string;
}

export interface PageView {
  id: string;
  path: string;
  title: string;
  starter: Code;
  solution: Code;
}

// The id and path a single-page problem's page gets.
export const SINGLE_PAGE = "index";

export function problemPages(p: ProblemFile): PageView[] {
  if (p.pages) return p.pages.map((pg) => ({ ...pg }));
  return [{ id: SINGLE_PAGE, path: p.path ?? "/index.html", title: p.id, starter: p.starter!, solution: p.solution! }];
}

// A problem with plain checks is one stage.
export function problemStages(p: ProblemFile): Stage[] {
  return p.grader.stages ?? [{ id: "all", title: p.id, says: "", checks: p.grader.checks! }];
}

export function allChecks(p: ProblemFile): DomCheck[] {
  return problemStages(p).flatMap((s) => s.checks);
}

export function siteFiles(p: ProblemFile): SiteFile[] {
  return p.files ?? [];
}

// The axe-core rule ids a list of checks asks for, without duplicates.
export function axeRules(checks: DomCheck[]): string[] {
  return [...new Set(checks.flatMap((c) => c.axe ?? []))];
}

// Each edit replaces the first occurrence of `find`. Runs of whitespace in `find` match any run of
// whitespace, so fixtures need not reproduce the solution's indentation.
function applyEdits(base: string, edits: { find: string; replace: string }[] | undefined, where: string): string {
  let out = base;
  for (const e of edits ?? []) {
    const pattern = e.find
      .trim()
      .split(/\s+/)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s+");
    const m = new RegExp(pattern).exec(out);
    if (!m) throw new Error(`${where}: edit target not found: ${JSON.stringify(e.find.slice(0, 60))}`);
    out = out.slice(0, m.index) + e.replace + out.slice(m.index + m[0].length);
  }
  return out;
}

// The code of every page for a fixture: its own html, or the solution with its edits applied.
export function fixtureCode(p: ProblemFile, f: Fixture): Record<string, Code> {
  const pages = problemPages(p);
  const out: Record<string, Code> = {};
  for (const pg of pages) {
    const own = p.pages ? f.pages?.[pg.id] : f;
    const where = `${p.id} fixture "${f.name}" page ${pg.id}`;
    out[pg.id] = own
      ? {
          html: applyEdits(own.html ?? pg.solution.html, own.edits, where),
          css: applyEdits(own.css ?? pg.solution.css, undefined, where),
        }
      : { ...pg.solution };
  }
  if (p.pages && f.pages) {
    for (const k of Object.keys(f.pages)) if (!pages.some((pg) => pg.id === k)) throw new Error(`${p.id} fixture "${f.name}": unknown page ${k}`);
  }
  return out;
}

export function starterCode(p: ProblemFile): Record<string, Code> {
  return Object.fromEntries(problemPages(p).map((pg) => [pg.id, pg.starter]));
}

export function solutionCode(p: ProblemFile): Record<string, Code> {
  return Object.fromEntries(problemPages(p).map((pg) => [pg.id, pg.solution]));
}
