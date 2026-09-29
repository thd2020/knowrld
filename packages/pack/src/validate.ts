import { excerptConflict } from "./licence.ts";
import type { Issue, LoadedPack } from "./load.ts";

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
      if (!p) err(where, `problem ${n.problem} is missing`);
      usedProblems.add(n.problem);
    }
  }
  for (const p of problems) if (!usedProblems.has(p.id)) warn(`problems/${p.id}`, "no node uses this problem");

  const { cycle } = topoOrder(nodes);
  if (cycle.length) err("graph", `prerequisite cycle among: ${cycle.join(", ")}`);

  for (const r of manifest.regions) {
    const inRegion = nodes.filter((n) => n.region === r.id);
    if (inRegion.length === 0) err(`pack.yaml`, `region ${r.id} has no nodes`);
    else if (!inRegion.some((n) => n.kind === "project")) warn(`pack.yaml`, `region ${r.id} has no capstone project`);
  }

  const final = nodes.find((n) => n.id === manifest.final);
  if (!final) err("pack.yaml", `final boss ${manifest.final} is not a node`);
  else if (final.kind !== "project") err("pack.yaml", `final boss ${manifest.final} must be a project`);

  return issues;
}
