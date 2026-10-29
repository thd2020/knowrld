import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { stringify } from "yaml";
import { loadRealm, realmNodes, validateRealm, type LoadedRealm } from "../src/realm.ts";
import { RealmManifest } from "../src/schema.ts";

const realmDir = fileURLToPath(new URL("../../../realms/example-web", import.meta.url));
const packsDir = fileURLToPath(new URL("../../../packs", import.meta.url));

// The example realm is loaded once; each case mutates a copy, the way the pack tests do.
const { realm: example, issues: loadIssues } = loadRealm(realmDir);
const copy = (): LoadedRealm => structuredClone(example!);
const errors = (realm: LoadedRealm) => validateRealm(realm).filter((i) => i.level === "error").map((i) => i.message);

// Writes a realm.yaml into a fresh folder. World paths are given relative to packs/ and rewritten relative to the folder.
function onDisk(manifest: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "realm-"));
  const worlds = (manifest.worlds as { path: string }[]).map((w) => ({ ...w, path: relative(dir, join(packsDir, w.path)) }));
  writeFileSync(join(dir, "realm.yaml"), stringify({ ...manifest, worlds }));
  return dir;
}

describe("the example realm", () => {
  it("loads and validates with no errors", () => {
    expect(loadIssues).toEqual([]);
    expect(errors(example!)).toEqual([]);
  });

  it("applies the link and the override without losing the pack's own data", () => {
    const nodes = new Map(realmNodes(example!).map((n) => [n.id, n]));
    const selectors = nodes.get("web-basics/selectors")!;
    expect(selectors.requires).toEqual(["web-basics/css-rules", "semantic-html/attributes"]);
    expect(selectors.node.requires).toEqual(["css-rules"]);
    const landmarks = nodes.get("web-basics/landmarks")!;
    expect(landmarks.title).toBe("Page landmarks, a first look");
    expect(landmarks.node.title).toBe("Page landmarks");
  });
});

describe("realm rules", () => {
  it("rejects references to unknown worlds and unknown nodes", () => {
    const realm = copy();
    realm.manifest.links.push({ node: "css-world/cascade", requires: ["semantic-html/no-such-node"] });
    realm.manifest.gates.push({ id: "nowhere", from: { world: "web-basics", near: "ghost" }, to: { world: "semantic-html", near: "attributes" } });
    const messages = errors(realm).join("\n");
    expect(messages).toMatch(/unknown world css-world/);
    expect(messages).toMatch(/unknown node no-such-node in world semantic-html/);
    expect(messages).toMatch(/unknown node ghost in world web-basics/);
  });

  it("rejects a version that is not the pack's manifest version", () => {
    const realm = copy();
    realm.manifest.worlds[1]!.version = "0.2.0";
    expect(errors(realm).join("\n")).toMatch(/version 0.2.0 does not match the pack's version 0.1.0/);
  });

  it("rejects a world whose pack folder does not load", () => {
    const m = stringifyRoundTrip();
    const [high, low] = m.worlds as Record<string, unknown>[];
    const dir = onDisk({ ...m, worlds: [{ ...high, path: "semantic-html" }, { ...low, path: "no-such-pack" }] });
    try {
      const { realm, issues } = loadRealm(dir);
      const messages = [...issues, ...validateRealm(realm!)].map((i) => i.message).join("\n");
      expect(messages).toMatch(/pack.yaml is missing/);
      expect(messages).toMatch(/did not load/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("rejects a prerequisite cycle that runs across worlds", () => {
    const realm = copy();
    // semantic-html/attributes requires html-elements; a link back from it closes a loop through web-basics/selectors.
    realm.manifest.links.push({ node: "semantic-html/html-elements", requires: ["web-basics/selectors"] });
    expect(errors(realm).join("\n")).toMatch(/prerequisite cycle among: .*semantic-html\/attributes.*web-basics\/selectors/);
  });

  it("rejects a cycle made by added same-world requires", () => {
    const realm = copy();
    realm.manifest.overrides.push({ op: "add-requires", target: "web-basics/html-elements", requires: ["web-basics/lists"], reason: "test" });
    expect(errors(realm).join("\n")).toMatch(/prerequisite cycle/);
  });

  it("rejects a link inside one world, and added requires across worlds", () => {
    const realm = copy();
    realm.manifest.links.push({ node: "web-basics/cascade", requires: ["web-basics/box-model"] });
    realm.manifest.overrides.push({ op: "add-requires", target: "web-basics/cascade", requires: ["semantic-html/semantics"], reason: "test" });
    const messages = errors(realm).join("\n");
    expect(messages).toMatch(/web-basics\/box-model is in the same world/);
    expect(messages).toMatch(/semantic-html\/semantics is in another world/);
  });

  it("rejects a gate that stays in one world", () => {
    const realm = copy();
    realm.manifest.gates[0]!.to = { world: "web-basics", near: "cascade" };
    expect(errors(realm).join("\n")).toMatch(/gate must join two different worlds/);
  });

  it("rejects worlds at one altitude with no gate between them", () => {
    const realm = copy();
    realm.manifest.gates = [];
    for (const w of realm.worlds) w.world.place.altitude = 0;
    const messages = errors(realm).join("\n");
    expect(messages).toMatch(/from world semantic-html the player cannot reach web-basics/);
    expect(messages).toMatch(/from world web-basics the player cannot reach semantic-html/);
  });

  it("rejects a lower world with no gate back up", () => {
    const realm = copy();
    realm.manifest.gates = [];
    const messages = errors(realm);
    expect(messages).toEqual(["from world web-basics the player cannot reach semantic-html; add a gate"]);
  });

  it("requires a reason on every override", () => {
    const raw = stringifyRoundTrip();
    delete (raw.overrides as Record<string, unknown>[])[0]!.reason;
    expect(RealmManifest.safeParse(raw).success).toBe(false);
    (raw.overrides as Record<string, unknown>[])[0]!.reason = "   ";
    expect(RealmManifest.safeParse(raw).success).toBe(false);
    const realm = copy();
    realm.manifest.overrides[0]!.reason = "";
    expect(errors(realm).join("\n")).toMatch(/an override needs a reason/);
  });

  it("rejects an override on a node that does not exist", () => {
    const realm = copy();
    realm.manifest.overrides[0]!.target = "web-basics/no-such-node";
    expect(errors(realm).join("\n")).toMatch(/unknown node no-such-node in world web-basics/);
  });

  it("rejects a realm licence that a member pack's licence does not allow", () => {
    const permissive = copy();
    permissive.manifest.license = "CC-BY-4.0";
    expect(errors(permissive).join("\n")).toMatch(/share-alike/);
    const nonCommercial = copy();
    nonCommercial.worlds[1]!.pack!.manifest.license = "CC-BY-NC-SA-4.0";
    // A realm cannot be both share-alike, for semantic-html, and non-commercial, for this web-basics.
    expect(errors(nonCommercial).join("\n")).toMatch(/non-commercial/);
  });

  it("needs at least two worlds, each listed once", () => {
    const raw = stringifyRoundTrip();
    expect(RealmManifest.safeParse({ ...raw, worlds: (raw.worlds as unknown[]).slice(0, 1) }).success).toBe(false);
    const realm = copy();
    realm.worlds.push(structuredClone(realm.worlds[0]!));
    expect(errors(realm).join("\n")).toMatch(/duplicate world semantic-html/);
  });
});

// The example manifest as plain data, for schema-level cases.
function stringifyRoundTrip(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(example!.manifest)) as Record<string, unknown>;
}
