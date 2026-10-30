// A world's place in the map of knowledge (pack.yaml `place`): the form of its path in each scheme.
// The kit vendors no classification data; it checks that a path is well formed for its scheme, and
// the engine that draws the map checks that each class exists there.
import { PLACE_SCHEMES } from "./schema.ts";

export type PlaceScheme = (typeof PLACE_SCHEMES)[number];

export function isPlaceScheme(s: string): s is PlaceScheme {
  return (PLACE_SCHEMES as readonly string[]).includes(s);
}

/** The problems with a place, as messages; none means it is well formed. */
export function placeProblems(place: { scheme: string; path: readonly (string | number)[] }): string[] {
  const out: string[] = [];
  if (!isPlaceScheme(place.scheme)) {
    return [`place: unknown scheme "${place.scheme}"; the schemes are ${PLACE_SCHEMES.join(", ")}`];
  }
  const path = place.path;
  const numbers = path.filter((c) => typeof c === "number");
  if (numbers.length) return [`place: class ids are strings; quote ${numbers.join(", ")} (YAML reads 1.10 as 1.1)`];
  const ids = path as readonly string[];
  if (new Set(ids).size !== ids.length) out.push("place: the path names a class twice");
  if (place.scheme === "oecd-ford-2015") {
    if (ids.length > 2) out.push("place: an oecd-ford-2015 path has at most two levels (field, sub-field)");
    if (!/^[1-6]$/.test(ids[0] ?? "")) out.push(`place: "${ids[0]}" is not a broad field of oecd-ford-2015 (1 to 6)`);
    const sub = ids[1];
    if (sub !== undefined && !(new RegExp(`^${ids[0]}\\.([1-9]|1[0-9])$`).test(sub))) {
      out.push(`place: "${sub}" is not a sub-field of field ${ids[0]} (written ${ids[0]}.n)`);
    }
  } else {
    if (ids.length > 6) out.push("place: an acm-ccs-2012 path has at most six levels");
    for (const c of ids) if (!/^100\d{5}$/.test(c)) out.push(`place: "${c}" is not an acm-ccs-2012 concept id (eight digits, 100nnnnn)`);
  }
  return out;
}
