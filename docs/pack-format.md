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

A problem gives a statement, starter code, a reference solution and a grader. Graders are declarative, so a pack carries data and never code. The reference solution must pass every check and the starter code must fail at least one.

### Checks

A DOM check first selects elements, then asserts something about them.

- **Selecting.** `selector` is a CSS selector. `within` keeps elements inside an ancestor matching another selector. `role` keeps elements whose computed ARIA role (implicit, as HTML-AAM maps it, or explicit) is the given one; a check with `role` and no selector selects every element with that role, which is how a check counts landmarks. `first` keeps only the first match in document order. `count` bounds how many are selected (default: at least one).
- **Asserting on the selection.** `unique` names an attribute (or `text`) whose values must all differ, for example `unique: id` on `[id]`.
- **Asserting on elements.** These must hold for one selected element, or for every one with `every: true`:
  - `attr`: an attribute is present, absent, equal to a value or matching a pattern;
  - `text`: the text matches or must not match a pattern (`own: true` looks only at the element's own text nodes, to find loose text);
  - `name`: the accessible name, as a screen reader would announce it (aria-labelledby, aria-label, alt, content, title), matches or must not match;
  - `style`: a computed style;
  - `datetime`: the element's machine-readable date or time (its `datetime` attribute, or its text when it has none) is valid under the HTML standard's date and time microsyntaxes;
  - `outline`: the headings inside the element never skip a level going down, and with `start` the first is at that level;
  - `next`: the siblings that follow, in order, each matching `is` and `text`; whitespace and comments are skipped but text is not, unlike CSS sibling combinators. A last step with `absent: true` says what must not follow;
  - `precedes`: the element comes before every element matching a selector, in document order;
  - `resolves`: the element's `href` leads to a page or file of the problem's site and its fragment to an existing id there. `resolves: { page }` also requires a particular page, and `resolves: { to }` requires the fragment's element to match a selector.
- **Asserting on the document.** `doctype: true` requires `<!doctype html>`. `axe` lists axe-core rule ids that must report no violations. The pack only names the rules: the engine that hosts the grader runs axe-core and hands the findings to the grader, and a host that cannot run them reports the check as not passed.

Patterns are case-insensitive regular expressions. `concepts` may list the graph nodes a check assesses, for feedback and review scheduling; the validator checks that they exist.

### Sites, pages and stages

Links are graded against a site. A single-page problem's page sits at `path` (default `/index.html`), and `files` lists the site's other files, with the fragment ids inside any page the player does not edit, so that `resolves` can tell a working link from a broken one.

A multi-page problem lists `pages` instead of `starter` and `solution`: each page has an id, a `path`, a title, a starter and a solution, and they are graded together as one site. A check runs on every page unless `pages` limits it, and passes only if it passes on each. With `pooled: true` it selects across the pages at once, for example to require unique titles site-wide.

A grader has either `checks` or `stages`. A stage has an id, a title, a line saying what it asks, and its own checks; a project falls when every stage passes.

### Fixtures

`fixtures.pass` lists other correct answers and `fixtures.fail` lists plausible wrong ones, so tests can show that a grader accepts any valid answer and rejects the mistakes it is meant to catch. A fixture is a full page (`html`), or the reference solution with `edits` (each `find` must occur in it); in a multi-page problem, `pages` overrides some pages. A wrong fixture names the check ids it must fail in `fails` and says why in `because`. Fixtures are test data and are never shipped to players.

## Licence classes

Every licence falls into one of four classes, and the validator refuses excerpts whose licence does not fit the pack's own licence.

| Class | Licences | Rule |
|---|---|---|
| A, permissive | CC0, CC BY, Apache-2.0, MIT, PSF, W3C software | Allowed in any pack |
| B, share-alike | CC BY-SA | The pack must itself be CC BY-SA |
| C, non-commercial | CC BY-NC, CC BY-NC-SA | Only in a non-commercial pack |
| D, link-only | Anything else, including all rights reserved | Paraphrase and link; no verbatim excerpts |

A licence id ending in `+` means "or any later version", as in SPDX.
