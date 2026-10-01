# knowrld pack format

knowrld is a role-playing game in which every world teaches one field to professional mastery. Each world is built from a domain pack: the field's knowledge as a graph of concepts, problems and projects, every one of them carried by a character or creature in the world and backed by an official source. This repository holds the open part of that system, so that anyone can write and check a pack:

- the pack format, as schemas and a written specification in [docs/pack-format.md](docs/pack-format.md),
- a validator that rejects a pack when a node cites no source, a problem has no grader, the prerequisite graph has a cycle, or a source's licence does not allow its excerpts in the pack,
- a grader that checks a player's HTML and CSS against a problem's declarative checks,
- the `knowrld-pack` command line tool,
- a sample pack, Web Basics, built on the MDN Curriculum,
- Semantic HTML, a one-region pack at full depth built on MDN Learn, with road and country tiers and a fogged wilderness list.

The game itself is developed separately.

## Use it

You need Node 24 or later.

```bash
npm install
```

Check a pack's structure, sources, graders and licences:

```bash
npm run validate
```

Every excerpt in a pack is cut verbatim from a pinned upstream commit and records its line range. This re-fetches each source and confirms the text is still there:

```bash
npm run verify
```

Run the unit tests for the licence rules, the validator and the grader:

```bash
npm test
```

## Licences

The code in this repository is licensed under the [Apache License 2.0](LICENSE). The Web Basics and Semantic HTML packs' text is licensed separately under CC BY-SA 4.0 because it quotes MDN Web Docs; see [packs/web-basics/LICENSE.md](packs/web-basics/LICENSE.md) and [packs/semantic-html/LICENSE.md](packs/semantic-html/LICENSE.md).
