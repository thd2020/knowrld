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

// True when the licence table knows the id (after any "+").
export function isKnownLicence(spdx: string): boolean {
  return parseLicence(spdx).id in CLASSES;
}

// Returns a reason when a realm cannot use `realm` as its own licence: one the table does not know
// (a typo, or a proprietary licence), or one that is link-only.
export function realmLicenceProblem(realm: string): string | undefined {
  if (!isKnownLicence(realm)) return `${realm} is not a licence the realm format knows; use an SPDX id from the licence table`;
  if (parseLicence(realm).cls === "D") return `${realm} is link-only and cannot carry the members' text`;
  return undefined;
}

// The share-alike licences: CC BY-SA and CC BY-NC-SA, with their version.
const SHARE_ALIKE = /^CC-BY(-NC)?-SA-(\d+(?:\.\d+)?)$/;
function shareAlike(id: string): { nc: boolean; version: number } | undefined {
  const m = SHARE_ALIKE.exec(id);
  return m ? { nc: !!m[1], version: Number(m[2]) } : undefined;
}

// Returns a reason when a member pack under `pack` cannot join a realm under `realm`, or undefined
// when it can. The excerpt rules apply with the pack in the place of the source, and share-alike is
// kept whole: a CC BY-NC-SA pack needs a CC BY-NC-SA realm, and a share-alike pack needs the realm's
// share-alike licence to be at least the pack's version. The realm's stated version is compared,
// ignoring any "+". Use realmLicenceProblem first for the realm's own licence.
export function realmConflict(pack: string, realm: string): string | undefined {
  const conflict = excerptConflict(pack, realm);
  if (conflict) return conflict;
  const p = shareAlike(parseLicence(pack).id);
  if (!p) return undefined;
  const r = shareAlike(parseLicence(realm).id);
  if (p.nc && !r?.nc) return `${pack} is non-commercial share-alike, so the realm must use a BY-NC-SA licence, not ${realm}`;
  if (r && r.version < p.version) {
    return `${pack} is share-alike at version ${p.version.toFixed(1)}, so the realm's licence must be version ${p.version.toFixed(1)} or later, not ${realm}`;
  }
  return undefined;
}
