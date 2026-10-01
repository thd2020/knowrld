import { excerptConflict } from "./licence.ts";
import type { Issue, LoadedPack } from "./load.ts";
import type { ProblemFile } from "./schema.ts";
import { allChecks, fixtureCode, problemPages } from "./problem.ts";

function badPattern(re: string | undefined): boolean {
  if (re === undefined) return false;
  try {
    new RegExp(re, "i");
    return false;
  } catch {
    return true;
  }
}

// Problems are data, so the validator can read every grader: ids, page names, patterns and fixtures.
export function validateProblem(p: ProblemFile): string[] {
  const out: string[] = [];
  const checks = allChecks(p);
  const pageIds = new Set(problemPages(p).map((pg) => pg.id));
  const seen = new Set<string>();
  for (const c of checks) {
    if (seen.has(c.id)) out.push(`check id ${c.id} is used twice`);
    seen.add(c.id);
    const patterns = [c.attr?.matches, c.text?.matches, c.text?.not, c.name?.matches, c.name?.not, ...(c.next ?? []).flatMap((s) => [s.text?.matches, s.text?.not])];
    if (patterns.some(badPattern)) out.push(`check ${c.id} has an invalid regular expression`);
    for (const pg of c.pages ?? []) if (!pageIds.has(pg)) out.push(`check ${c.id} names unknown page ${pg}`);
    if (typeof c.resolves === "object" && c.resolves.page && !pageIds.has(c.resolves.page)) out.push(`check ${c.id} resolves to unknown page ${c.resolves.page}`);
    if (c.pages && !p.pages) out.push(`check ${c.id} names pages, but the problem has only one`);
    if (c.pooled && !p.pages) out.push(`check ${c.id} is pooled, but the problem has only one page`);
  }
  const paths = problemPages(p).map((pg) => pg.path);
  if (new Set(paths).size !== paths.length) out.push("two pages share a path");
  for (const f of [...(p.fixtures?.pass ?? []), ...(p.fixtures?.fail ?? [])]) {
    try {
      fixtureCode(p, f);
    } catch (e) {
      out.push((e as Error).message);
    }
    for (const id of f.fails ?? []) if (!seen.has(id)) out.push(`fixture "${f.name}" expects unknown check ${id} to fail`);
  }
  for (const f of p.fixtures?.fail ?? []) if (!f.fails?.length) out.push(`wrong fixture "${f.name}" must name the checks it fails`);
  return out;
}


// Returns ids in prerequisite order, or the ids left on a cycle.
export function topoOrder(nodes: { id: string; requires: string[] }[]): { order: string[]; cycle: string[] } {
  const indegree = new Map(nodes.map((n) => [n.id, 0]));
  const next = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const n of nodes) {
    for (const r of n.requires) {
      if (!indegree.has(r)) continue;
      indegree.set(n.id, indegree.get(n.id)! + 1);
      next.get(r)!.push(n.id);
    }
  }
  const queue = nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const m of next.get(id)!) {
      indegree.set(m, indegree.get(m)! - 1);
      if (indegree.get(m) === 0) queue.push(m);
    }
  }
  const cycle = nodes.map((n) => n.id).filter((id) => !order.includes(id));
  return { order, cycle };
}

export function validatePack(pack: LoadedPack): Issue[] {
  const issues: Issue[] = [];
  const err = (file: string, message: string) => issues.push({ level: "error", file, message });
  const warn = (file: string, message: string) => issues.push({ level: "warning", file, message });
  const { manifest, sources, nodes, problems } = pack;
  const fog = pack.fog ?? [];

  const dup = (kind: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const i of ids) {
      if (seen.has(i)) err(kind, `duplicate id ${i}`);
      seen.add(i);
    }
  };
  dup("sources", sources.map((s) => s.id));
  dup("graph", nodes.map((n) => n.id));
  dup("problems", problems.map((p) => p.id));

  // Every source's licence must allow its excerpts in this pack.
  const excerpts = new Map<string, { verbatim: boolean }>();
  for (const s of sources) {
    for (const e of s.excerpts) {
      excerpts.set(`${s.id}#${e.id}`, e);
      if (e.verbatim) {
        const conflict = excerptConflict(s.license, manifest.license);
        if (conflict) err(`sources/${s.id}`, `excerpt ${e.id}: ${conflict}`);
      }
    }
  }

  const regionIds = new Set(manifest.regions.map((r) => r.id));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const problemById = new Map(problems.map((p) => [p.id, p]));
  const usedProblems = new Set<string>();

  for (const n of nodes) {
    const where = `graph/${n.id}`;
    if (!regionIds.has(n.region)) err(where, `unknown region ${n.region}`);
    for (const r of n.requires) if (!nodeIds.has(r)) err(where, `requires unknown node ${r}`);
    if (n.cites.length === 0) err(where, "cites no source; every node needs an official source");
    for (const c of n.cites) if (!excerpts.has(c)) err(where, `cites unknown excerpt ${c}`);
    if (n.kind === "concept") {
      n.check.forEach((q, i) => {
        if (q.answer >= q.choices.length) err(where, `check ${i}: answer ${q.answer} is out of range`);
      });
    } else {
      const p = problemById.get(n.problem);
      if (!p && n.planned) warn(where, `problem ${n.problem} is planned but not written yet`);
      else if (!p) err(where, `problem ${n.problem} is missing`);
      else if (n.planned) warn(where, `problem ${n.problem} exists; drop planned`);
      usedProblems.add(n.problem);
    }
  }
  for (const p of problems) if (!usedProblems.has(p.id)) warn(`problems/${p.id}`, "no node uses this problem");
  for (const p of problems) {
    for (const m of validateProblem(p)) err(`problems/${p.id}`, m);
    for (const c of allChecks(p)) for (const n of c.concepts ?? []) if (!nodeIds.has(n)) err(`problems/${p.id}`, `check ${c.id} names unknown concept ${n}`);
  }

  const { cycle } = topoOrder(nodes);
  if (cycle.length) err("graph", `prerequisite cycle among: ${cycle.join(", ")}`);

  for (const r of manifest.regions) {
    const inRegion = nodes.filter((n) => n.region === r.id);
    if (inRegion.length === 0) err(`pack.yaml`, `region ${r.id} has no nodes`);
    else if (!inRegion.some((n) => n.kind === "project")) warn(`pack.yaml`, `region ${r.id} has no capstone project`);
  }

  dup("fog", fog.map((f) => f.slug));
  for (const f of fog) if (!regionIds.has(f.region)) err("fog.yaml", `${f.slug}: unknown region ${f.region}`);

  const final = nodes.find((n) => n.id === manifest.final);
  if (!final) err("pack.yaml", `final boss ${manifest.final} is not a node`);
  else if (final.kind !== "project") err("pack.yaml", `final boss ${manifest.final} must be a project`);

  return issues;
}
