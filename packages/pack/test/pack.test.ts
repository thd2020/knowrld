import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "node:url";
import { loadPack, validatePack, excerptConflict, topoOrder } from "../src/index.ts";
import { composeDocument, gradeDocument } from "../src/dom-grader.ts";
import type { LoadedPack } from "../src/load.ts";

const packDir = fileURLToPath(new URL("../../../packs/web-basics", import.meta.url));

function loadWebBasics(): LoadedPack {
  const { pack, issues } = loadPack(packDir);
  expect(issues).toEqual([]);
  return pack!;
}

describe("licence classes", () => {
  it("lets share-alike excerpts into a share-alike pack only", () => {
    expect(excerptConflict("CC-BY-SA-2.5+", "CC-BY-SA-4.0")).toBeUndefined();
    expect(excerptConflict("CC-BY-SA-2.5+", "CC-BY-4.0")).toMatch(/share-alike/);
  });
  it("keeps non-commercial text out of other packs", () => {
    expect(excerptConflict("CC-BY-NC-SA-4.0", "CC-BY-SA-4.0")).toMatch(/non-commercial/);
    expect(excerptConflict("CC-BY-NC-SA-4.0", "CC-BY-NC-SA-4.0")).toBeUndefined();
  });
  it("treats unknown licences as link-only", () => {
    expect(excerptConflict("LicenseRef-Oracle", "CC-BY-SA-4.0")).toMatch(/link-only/);
  });
  it("lets permissive text in anywhere", () => {
    expect(excerptConflict("Apache-2.0", "CC-BY-SA-4.0")).toBeUndefined();
  });
});

describe("validator", () => {
  it("accepts the web-basics pack with no issues", () => {
    expect(validatePack(loadWebBasics()).filter((i) => i.level === "error")).toEqual([]);
  });

  it("finds prerequisite cycles", () => {
    const { cycle } = topoOrder([
      { id: "a", requires: ["c"] },
      { id: "b", requires: ["a"] },
      { id: "c", requires: ["b"] },
      { id: "d", requires: [] },
    ]);
    expect(cycle.sort()).toEqual(["a", "b", "c"]);
  });

  it("rejects an uncited node, a link-only verbatim excerpt and a missing problem", () => {
    const pack = structuredClone(loadWebBasics());
    const concept = pack.nodes.find((n) => n.kind === "concept")!;
    concept.cites = [];
    pack.sources[0]!.license = "LicenseRef-AllRightsReserved";
    const problem = pack.nodes.find((n) => n.kind === "problem")!;
    if (problem.kind !== "concept") problem.problem = "does-not-exist";
    const messages = validatePack(pack).map((i) => i.message).join("\n");
    expect(messages).toMatch(/cites no source/);
    expect(messages).toMatch(/link-only/);
    expect(messages).toMatch(/problem does-not-exist is missing/);
  });
});

describe("semantic-html pack", () => {
  const dir = fileURLToPath(new URL("../../../packs/semantic-html", import.meta.url));
  it("loads and validates with no errors, only planned-problem warnings", () => {
    const { pack, issues } = loadPack(dir);
    expect(issues).toEqual([]);
    const found = validatePack(pack!);
    expect(found.filter((i) => i.level === "error")).toEqual([]);
    expect(found.every((i) => /planned but not written yet/.test(i.message))).toBe(true);
    expect(pack!.fog!.length).toBeGreaterThan(0);
    expect(pack!.nodes.every((n) => n.tier === "road" || n.tier === "country")).toBe(true);
  });
});

describe("optional tiers, planned problems and fog", () => {
  it("accepts a tier on nodes and treats a planned, unwritten problem as a warning", () => {
    const pack = structuredClone(loadWebBasics());
    const problem = pack.nodes.find((n) => n.kind === "problem")!;
    problem.tier = "road";
    if (problem.kind !== "concept") {
      problem.problem = "not-written-yet";
      problem.planned = true;
      problem.intent = "Fix the page.";
    }
    const issues = validatePack(pack);
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
    expect(issues.map((i) => i.message).join("\n")).toMatch(/not-written-yet is planned but not written yet/);
  });

  it("warns when a planned problem already exists", () => {
    const pack = structuredClone(loadWebBasics());
    const problem = pack.nodes.find((n) => n.kind === "problem")!;
    if (problem.kind !== "concept") problem.planned = true;
    expect(validatePack(pack).map((i) => i.message).join("\n")).toMatch(/exists; drop planned/);
  });

  it("rejects fog pages in unknown regions and duplicate fog slugs", () => {
    const pack = structuredClone(loadWebBasics());
    const page = { slug: "Web/HTML/Reference/Elements/hgroup", title: "<hgroup>", region: "html", tier: "wilderness" as const, url: "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/hgroup" };
    pack.fog = [page, page, { ...page, slug: "Glossary/ARIA", region: "nowhere" }];
    const messages = validatePack(pack).map((i) => i.message).join("\n");
    expect(messages).toMatch(/duplicate id Web\/HTML\/Reference\/Elements\/hgroup/);
    expect(messages).toMatch(/unknown region nowhere/);
  });

  it("loads a pack without fog.yaml as having no fog", () => {
    expect(loadWebBasics().fog).toEqual([]);
  });
});

// jsdom has no layout engine and only partial computed styles, so checks on
// computed style are left to the in-browser self-test page (selftest.html).
describe("graders against starters and reference solutions", () => {
  const pack = loadWebBasics();
  for (const p of pack.problems) {
    const structural = p.grader.checks.filter((c) => !c.style);
    it(`${p.id}: the reference solution passes every structural check`, () => {
      const dom = new JSDOM(composeDocument(p.solution.html, p.solution.css));
      const failed = gradeDocument(dom.window.document, structural).filter((r) => !r.pass);
      expect(failed).toEqual([]);
    });
  }
});
