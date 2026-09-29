// Licence classes, as described in docs/pack-format.md.
// A: permissive. B: share-alike. C: non-commercial. D: link-only (no excerpts).
export type LicenceClass = "A" | "B" | "C" | "D";

const CLASSES: Record<string, LicenceClass> = {
  "CC0-1.0": "A",
  "CC-BY-4.0": "A",
  "CC-BY-3.0": "A",
  "Apache-2.0": "A",
  MIT: "A",
  "PSF-2.0": "A",
  "W3C-20150513": "A",
  "CC-BY-SA-2.5": "B",
  "CC-BY-SA-3.0": "B",
  "CC-BY-SA-4.0": "B",
  "CC-BY-NC-4.0": "C",
  "CC-BY-NC-SA-4.0": "C",
};

export interface ParsedLicence {
  id: string;
  orLater: boolean;
  cls: LicenceClass;
}

// Accepts a single SPDX id with an optional "+" (the SPDX "or later" operator).
export function parseLicence(spdx: string): ParsedLicence {
  const orLater = spdx.endsWith("+");
  const id = orLater ? spdx.slice(0, -1) : spdx;
  return { id, orLater, cls: CLASSES[id] ?? "D" };
}

// Returns a reason when a source under `source` cannot be excerpted verbatim into
// a pack under `pack`, or undefined when it can.
export function excerptConflict(source: string, pack: string): string | undefined {
  const s = parseLicence(source);
  const p = parseLicence(pack);
  if (s.cls === "D") return `${source} is link-only; excerpts must be paraphrases`;
  if (s.cls === "C" && p.cls !== "C") return `${source} is non-commercial and cannot go in a ${pack} pack`;
  if (s.cls === "B" && p.cls !== "B") {
    return `${source} is share-alike, so the pack must use a BY-SA licence, not ${pack}`;
  }
  return undefined;
}
