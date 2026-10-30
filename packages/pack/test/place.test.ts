import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { loadPack, validatePack, placeProblems, PackManifest } from "../src/index.ts";

const pack = (id: string) => {
  const { pack, issues } = loadPack(fileURLToPath(new URL(`../../../packs/${id}`, import.meta.url)));
  expect(issues).toEqual([]);
  return pack!;
};
const errors = (p: ReturnType<typeof pack>) => validatePack(p).filter((i) => i.level === "error").map((i) => i.message);

describe("a world's place", () => {
  it("is optional", () => {
    const p = structuredClone(pack("web-basics"));
    delete p.manifest.place;
    expect(errors(p)).toEqual([]);
  });

  it("is set in both sample packs, in ACM CCS 2012, Semantic HTML below Web Basics", () => {
    const html = pack("semantic-html").manifest.place!, basics = pack("web-basics").manifest.place!;
    expect(html.scheme).toBe("acm-ccs-2012");
    expect(basics.scheme).toBe("acm-ccs-2012");
    expect(html.path.slice(0, basics.path.length)).toEqual(basics.path);
    expect(placeProblems(html)).toEqual([]);
    expect(placeProblems(basics)).toEqual([]);
  });

  it("accepts well-formed paths in each scheme", () => {
    expect(placeProblems({ scheme: "oecd-ford-2015", path: ["1"] })).toEqual([]);
    expect(placeProblems({ scheme: "oecd-ford-2015", path: ["2", "2.10"] })).toEqual([]);
    expect(placeProblems({ scheme: "acm-ccs-2012", path: ["10002951", "10003260"] })).toEqual([]);
  });

  it("rejects an unknown scheme as a validation error", () => {
    const p = structuredClone(pack("web-basics"));
    p.manifest.place = { scheme: "dewey", path: ["004"] };
    expect(errors(p).join("\n")).toMatch(/unknown scheme "dewey"/);
  });

  it("rejects a malformed path as a validation error", () => {
    const p = structuredClone(pack("web-basics"));
    p.manifest.place = { scheme: "acm-ccs-2012", path: ["Information systems"] };
    expect(errors(p).join("\n")).toMatch(/not an acm-ccs-2012 concept id/);
  });

  it("names each malformation", () => {
    const bad = (scheme: string, path: (string | number)[]) => placeProblems({ scheme, path }).join("\n");
    expect(bad("oecd-ford-2015", ["7"])).toMatch(/not a broad field/);
    expect(bad("oecd-ford-2015", ["1", "2.1"])).toMatch(/not a sub-field of field 1/);
    expect(bad("oecd-ford-2015", ["1", "1.2", "1.3"])).toMatch(/at most two levels/);
    expect(bad("oecd-ford-2015", ["1", 1.2])).toMatch(/quote 1.2/);
    expect(bad("acm-ccs-2012", ["1000295"])).toMatch(/not an acm-ccs-2012 concept id/);
    expect(bad("acm-ccs-2012", ["10002951", "10002951"])).toMatch(/names a class twice/);
    expect(bad("acm-ccs-2012", ["10003001", "10003002", "10003003", "10003004", "10003005", "10003006", "10003007"])).toMatch(/at most six levels/);
  });

  it("refuses an empty path or extra keys in the manifest's schema", () => {
    const m = pack("web-basics").manifest;
    expect(PackManifest.safeParse({ ...m, place: { scheme: "acm-ccs-2012", path: [] } }).success).toBe(false);
    expect(PackManifest.safeParse({ ...m, place: { scheme: "acm-ccs-2012", path: ["10002951"], label: "x" } }).success).toBe(false);
  });
});
