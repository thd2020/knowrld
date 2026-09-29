# Pack format, version 0

A pack is a folder of YAML files. The schemas in `packages/pack/src/schema.ts` are the authoritative definition; this document explains them.

```
my-pack/
  pack.yaml        manifest
  sources/*.yaml   official sources and the excerpts cut from them
  graph/*.yaml     nodes: concepts, problems and projects
  problems/*.yaml  what a problem asks, its starter code, a reference solution and its checks
  fog.yaml         optional: pages around the region, listed but not taught
```

## Manifest

`pack.yaml` names the pack, its version, the SPDX id of its own licence, the external blueprint its structure follows (a curriculum, a certification guide or a standard), its regions in order, and the id of its final project.

## Sources

Each source records its title, URL, publisher, SPDX licence, retrieval date and, where possible, the raw file at a pinned commit. Its excerpts carry an id, the text exactly as it appears upstream, whether it is verbatim, and its line range. `knowrld-pack verify` re-fetches the raw file and fails if a verbatim excerpt is no longer there.

## Nodes

Every node belongs to a region, lists the nodes it requires, and cites at least one excerpt as `source-id#excerpt-id`. Each node is carried by an inhabitant of the world. A concept is taught by a character, who says one line in their own voice, quotes the cited excerpts, and asks retrieval questions. A problem is a creature that the player defeats by solving it. A project is a boss, and each region should end in one.

A node may carry an optional `tier`: `road` for the region's core curriculum pages, `country` for the reference pages one link away from them. Packs without tiers treat every node as road.

A problem or project node may carry a one-line `intent` and `planned: true`. A planned node whose problem file does not exist yet gives a warning instead of an error, so a graph can be drafted before its graders are written. Once the problem file exists, drop `planned`.

## Fog

`fog.yaml` lists pages a region names but does not quote, drawn as fog at its edge. Each entry has the page's `slug`, `title`, `url`, `region` and a `tier`: `country` for a page one link from the road that belongs to the region but has no excerpt, `wilderness` for a page further out. A wilderness page may name its `home`, the later region it belongs to (for example `forms` or `tables`). Fog pages have no characters and no excerpts; they only mark what lies around the taught ground.

## Problems

A problem gives a statement, starter code, a reference solution and a grader. Graders are declarative, so a pack carries data and never code. A DOM check selects elements with a CSS selector and asserts one or more of: a count range, an attribute that is present, equal to a value or matching a pattern, text that matches or must not match a pattern, a computed style, placement inside an ancestor, or the document's doctype. With `every: true` the assertion must hold for every selected element. The reference solution must pass every check and the starter code must fail at least one.

## Licence classes

Every licence falls into one of four classes, and the validator refuses excerpts whose licence does not fit the pack's own licence.

| Class | Licences | Rule |
|---|---|---|
| A, permissive | CC0, CC BY, Apache-2.0, MIT, PSF, W3C software | Allowed in any pack |
| B, share-alike | CC BY-SA | The pack must itself be CC BY-SA |
| C, non-commercial | CC BY-NC, CC BY-NC-SA | Only in a non-commercial pack |
| D, link-only | Anything else, including all rights reserved | Paraphrase and link; no verbatim excerpts |

A licence id ending in `+` means "or any later version", as in SPDX.
