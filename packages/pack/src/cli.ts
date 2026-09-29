#!/usr/bin/env node
// knowrld-pack validate <dir> | selftest <dir> -o <file> | verify <dir>
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadPack, type Issue } from "./load.ts";
import { validatePack } from "./validate.ts";

const [command, dir, ...rest] = process.argv.slice(2);
if (!command || !dir) {
  console.error("usage: knowrld-pack validate|selftest|verify <pack-dir> [-o file]");
  process.exit(2);
}

function report(issues: Issue[]): boolean {
  for (const i of issues) console[i.level === "error" ? "error" : "warn"](`${i.level}: ${i.file}: ${i.message}`);
  return !issues.some((i) => i.level === "error");
}

const { pack, issues } = loadPack(dir);
const ok = report(pack ? [...issues, ...validatePack(pack)] : issues);
if (!ok || !pack) process.exit(1);

if (command === "validate") {
  console.log(`${pack.manifest.id}: ${pack.nodes.length} nodes, ${pack.problems.length} problems, ${pack.sources.length} sources, valid`);
} else if (command === "selftest") {
  // Starters and reference solutions for the in-browser grader self-test. Never shipped to players.
  const out = rest[rest.indexOf("-o") + 1];
  if (!out || !rest.includes("-o")) throw new Error("selftest needs -o <file>");
  mkdirSync(dirname(out), { recursive: true });
  const cases = pack.problems.map((p) => ({ id: p.id, starter: p.starter, solution: p.solution, checks: p.grader.checks }));
  writeFileSync(out, JSON.stringify(cases));
  console.log(`wrote ${out}`);
} else if (command === "verify") {
  // Re-fetches each source at its pinned commit and checks every verbatim excerpt is still there.
  let failed = 0;
  for (const s of pack.sources) {
    if (!s.raw) continue;
    const upstream = (await (await fetch(s.raw)).text()).replace(/\r\n/g, "\n");
    for (const e of s.excerpts) {
      if (e.verbatim && !upstream.includes(e.text.trim())) {
        failed++;
        console.error(`not found upstream: ${s.id}#${e.id}`);
      }
    }
  }
  console.log(failed ? `${failed} excerpts differ from their source` : "every verbatim excerpt matches its pinned source");
  process.exit(failed ? 1 : 0);
} else {
  console.error(`unknown command ${command}`);
  process.exit(2);
}
