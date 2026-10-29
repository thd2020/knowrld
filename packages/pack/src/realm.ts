// Realm format v0: two or more packs joined into one release. See docs/realm-format.md.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { excerptConflict } from "./licence.ts";
import { loadPack, readYaml, type Issue, type LoadedPack } from "./load.ts";
import { RealmManifest, type GraphNode, type RealmWorld } from "./schema.ts";
import { topoOrder, validatePack } from "./validate.ts";

export interface LoadedWorld {
  world: RealmWorld;
  // Undefined when the pack folder is missing or its pack.yaml does not parse.
  pack?: LoadedPack;
}

export interface LoadedRealm {
  dir: string;
  manifest: RealmManifest;
  worlds: LoadedWorld[];
  // Issues from loading each member pack, kept so validateRealm can report them per world.
  packIssues?: Issue[];
}

// A node as the realm presents it: its realm id, the effective title and prerequisites after
// links and overrides, and the pack's node unchanged.
export interface RealmNode {
  id: string;
  world: string;
  title: string;
  requires: string[];
  node: GraphNode;
}

export function isRealm(dir: string): boolean {
  return existsSync(join(dir, "realm.yaml"));
}

export function loadRealm(dir: string): { realm?: LoadedRealm; issues: Issue[] } {
  const issues: Issue[] = [];
  const file = join(dir, "realm.yaml");
  if (!existsSync(file)) return { issues: [{ level: "error", file, message: "realm.yaml is missing" }] };
  const manifest = readYaml(RealmManifest, file, issues);
  if (!manifest) return { issues };
  const packIssues: Issue[] = [];
  const worlds = manifest.worlds.map((world) => {
    const { pack, issues: own } = loadPack(join(dir, world.path));
    packIssues.push(...own);
    return { world, pack };
  });
  return { realm: { dir, manifest, worlds, packIssues }, issues };
}

const split = (ref: string): [string, string] => {
  const i = ref.indexOf("/");
  return [ref.slice(0, i), ref.slice(i + 1)];
};

// Every node of every loaded world, with the realm's links and overrides applied. Nothing is removed:
// the pack's own node, title and requires are kept in `node`.
export function realmNodes(realm: LoadedRealm): RealmNode[] {
  const out = new Map<string, RealmNode>();
  for (const { world, pack } of realm.worlds) {
    for (const n of pack?.nodes ?? []) {
      const id = `${world.pack}/${n.id}`;
      out.set(id, { id, world: world.pack, title: n.title, requires: n.requires.map((r) => `${world.pack}/${r}`), node: n });
    }
  }
  const add = (target: string, refs: string[]) => {
    const n = out.get(target);
    if (!n) return;
    for (const r of refs) if (!n.requires.includes(r)) n.requires.push(r);
  };
  for (const l of realm.manifest.links) add(l.node, l.requires);
  for (const o of realm.manifest.overrides) {
    if (o.op === "add-requires") add(o.target, o.requires);
    else if (out.has(o.target)) out.get(o.target)!.title = o.title;
  }
  return [...out.values()];
}

export function validateRealm(realm: LoadedRealm): Issue[] {
  const issues: Issue[] = [];
  const err = (file: string, message: string) => issues.push({ level: "error", file, message });
  const { manifest } = realm;
  const where = "realm.yaml";

  // Worlds: unique, present, valid, at the stated version, under a licence the realm admits.
  const worlds = new Map<string, LoadedWorld>();
  for (const w of realm.worlds) {
    const id = w.world.pack;
    if (worlds.has(id)) err(where, `duplicate world ${id}`);
    worlds.set(id, w);
  }
  issues.push(...(realm.packIssues ?? []));
  for (const { world, pack } of realm.worlds) {
    const at = `worlds/${world.pack}`;
    if (!pack) {
      err(at, `pack at ${world.path} did not load`);
      continue;
    }
    for (const i of validatePack(pack)) issues.push({ ...i, file: `${world.path}/${i.file}` });
    if (pack.manifest.id !== world.pack) err(at, `the pack at ${world.path} is ${pack.manifest.id}, not ${world.pack}`);
    if (pack.manifest.version !== world.version) err(at, `version ${world.version} does not match the pack's version ${pack.manifest.version}`);
    const conflict = excerptConflict(pack.manifest.license, manifest.license);
    if (conflict) err(at, `licence ${pack.manifest.license} does not fit the realm's ${manifest.license}: ${conflict}`);
  }

  // References: "<world>/<node>" must name a listed world that loaded and a node in it.
  const nodeIds = new Map<string, Set<string>>();
  for (const { world, pack } of realm.worlds) if (pack) nodeIds.set(world.pack, new Set(pack.nodes.map((n) => n.id)));
  const resolves = (at: string, ref: string): boolean => {
    const [w, n] = split(ref);
    if (!worlds.has(w)) {
      err(at, `${ref}: unknown world ${w}`);
      return false;
    }
    const ids = nodeIds.get(w);
    if (!ids) return false; // the world failed to load; already reported
    if (!ids.has(n)) {
      err(at, `${ref}: unknown node ${n} in world ${w}`);
      return false;
    }
    return true;
  };

  for (const l of manifest.links) {
    const at = `links/${l.node}`;
    resolves(at, l.node);
    for (const r of l.requires) {
      resolves(at, r);
      if (split(r)[0] === split(l.node)[0]) err(at, `${r} is in the same world; in-world prerequisites belong in the pack`);
    }
  }

  const gateIds = new Set<string>();
  for (const g of manifest.gates) {
    const at = `gates/${g.id}`;
    if (gateIds.has(g.id)) err(at, `duplicate gate id ${g.id}`);
    gateIds.add(g.id);
    resolves(at, `${g.from.world}/${g.from.near}`);
    resolves(at, `${g.to.world}/${g.to.near}`);
    if (g.from.world === g.to.world) err(at, "a gate must join two different worlds");
  }

  for (const [i, o] of manifest.overrides.entries()) {
    const at = `overrides/${i}`;
    if (!o.reason?.trim()) err(at, "an override needs a reason");
    resolves(at, o.target);
    if (o.op === "add-requires") {
      for (const r of o.requires) {
        resolves(at, r);
        if (split(r)[0] !== split(o.target)[0]) err(at, `${r} is in another world; cross-world prerequisites are links`);
      }
    }
  }

  // The combined prerequisite graph: every pack's own requires, the links and the added requires.
  const { cycle } = topoOrder(realmNodes(realm));
  if (cycle.length) err(where, `prerequisite cycle among: ${cycle.join(", ")}`);

  // Reachability: a gate can be walked both ways, and a player can glide from a world to any strictly
  // lower one. Every world must be reachable from every other.
  const ids = [...worlds.keys()];
  const next = new Map(ids.map((w) => [w, new Set<string>()]));
  for (const g of manifest.gates) {
    if (!worlds.has(g.from.world) || !worlds.has(g.to.world)) continue;
    next.get(g.from.world)!.add(g.to.world);
    next.get(g.to.world)!.add(g.from.world);
  }
  for (const a of realm.worlds) {
    for (const b of realm.worlds) {
      if (a.world.place.altitude > b.world.place.altitude) next.get(a.world.pack)!.add(b.world.pack);
    }
  }
  for (const from of ids) {
    const seen = new Set([from]);
    const queue = [from];
    while (queue.length) for (const m of next.get(queue.shift()!)!) if (!seen.has(m)) seen.add(m), queue.push(m);
    const missed = ids.filter((w) => !seen.has(w));
    if (missed.length) err(where, `from world ${from} the player cannot reach ${missed.join(", ")}; add a gate`);
  }

  return issues;
}
