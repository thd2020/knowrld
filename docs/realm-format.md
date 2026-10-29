# Realm format, version 0

A world is one pack. Worlds start separate, each with its own new character. A realm joins two or more worlds into one release, played with one shared character on one continuous map. Joining is an authoring act done before release: the authors agree, and a curator may adjust the worlds slightly without losing any information. The schemas in `packages/pack/src/schema.ts` (`RealmManifest` and the types after it) are the authoritative definition; this document explains them.

```
my-realm/
  realm.yaml       manifest
```

The packs themselves stay in their own folders; a realm only points at them. Worlds in a realm seldom overlap in content but depend on each other, as CSS selectors need HTML elements, so a realm mostly adds prerequisites between worlds and places the worlds on one map.

## Manifest

`realm.yaml` has `format: 0`, an `id` (lowercase kebab-case, as pack ids are), a `title`, a `summary`, the SPDX id of the realm's `license`, and the lists below. `links`, `gates` and `overrides` may be left out when empty.

## Worlds

`worlds` lists at least two worlds. Each has:

- `pack`: the pack's id. It is also the world's id in the realm, so a pack can appear only once;
- `version`: the pack's version, exactly as its `pack.yaml` states it;
- `path`: the pack folder, relative to the realm folder;
- `place`: `x`, `z` and `altitude`, in metres. `x` and `z` place the world on the ground plane; `altitude` is its height. A higher world floats above a lower one.

Inside a realm a node is named `<world>/<node>`, for example `web-basics/selectors`.

## Links

A link adds prerequisites that cross worlds: `node` is the node that gains them, and `requires` lists the nodes it now requires. Every entry of `requires` must be in a different world from `node`. Prerequisites inside one world belong in that world's pack.

## Gates

A gate is a passage between two worlds. It has an `id`, unique in the realm, and two ends, `from` and `to`, each naming a `world` and the node the end stands `near`. The two ends must be in different worlds. A gate can be walked both ways; `from` and `to` only name its ends.

## Overrides

Overrides are the curator's adjustments. None of them deletes anything: the pack is never changed, and an engine can always show what the pack says. Each override has an `op`, a `target` node and a `reason`, a sentence saying why the join needs it. Version 0 has two:

- `retitle` gives the target a new `title` within the realm, for example to tell apart two characters whose titles would clash on one map. The pack keeps its own title.
- `add-requires` adds `requires` to the target, all in the target's own world: prerequisites inside a world that the join makes necessary. Cross-world prerequisites are links, not overrides.

## Example

[`realms/example-web/realm.yaml`](../realms/example-web/realm.yaml) joins Semantic HTML and Web Basics. Semantic HTML floats 120 m above Web Basics, so the player can learn markup up high and glide down to style it. One link makes `web-basics/selectors` require `semantic-html/attributes`, because class and ID selectors match the class and id attributes and Web Basics has no concept for attributes. One gate leads from the selectors back up to the attributes. One override retitles `web-basics/landmarks`, because Semantic HTML has its own Landmarks character.

## Rules

The validator rejects a realm when:

- a world's pack does not load, or does not validate as a pack;
- the pack at a world's `path` has a different id from `pack`, or a version other than `version`;
- two worlds name the same pack, or two gates share an id;
- a node reference names a world the realm does not list, or a node its world does not have. This covers links, gate ends and override targets and requires;
- a link requires a node in its own world, or an `add-requires` override adds a node from another world;
- a gate's two ends are in one world;
- an override has no reason, or only white space;
- the combined prerequisite graph has a cycle. The graph has every node of every world, with its pack's own requires, the links and the added requires;
- a world cannot be reached from another (below);
- a member pack's licence does not fit the realm's licence (below).

### Reaching every world

The player moves between worlds in two ways: through a gate, in either direction, or by gliding down from a world to any world whose altitude is strictly lower. Gliding is one way. Draw a directed graph with one vertex per world, an edge each way for every gate, and an edge from each world to every strictly lower one. Every world must be reachable from every other world in this graph.

So two worlds at the same altitude need a gate between them, and a lower world needs a gate, directly or through other worlds, that leads back up. Version 0 ignores distance on the ground: a world can be glided down to from any higher world, however far away.

### Licences

A realm carries the text of every member pack, so each pack's licence must fit the realm's licence under the rules packs already use for their sources (see [Licence classes](pack-format.md#licence-classes)), with the pack in the place of the source and the realm in the place of the pack:

- a permissive pack fits any realm;
- a share-alike pack pulls the realm to share-alike: the realm must be CC BY-SA;
- a non-commercial pack fits only a non-commercial realm, so it cannot join a share-alike or a permissive realm;
- a pack under a link-only licence cannot join a realm.

The check is `excerptConflict(packLicence, realmLicence)` in `packages/pack/src/licence.ts`.

## Validating

```bash
node packages/pack/src/cli.ts validate realms/example-web
```

`knowrld-pack validate` takes either a pack or a realm folder; a folder with `realm.yaml` is a realm. It reports each member pack's issues along with the realm's own. `verify` and `selftest` work on one pack, so run them on each member pack.

`realmNodes` in `packages/pack/src/realm.ts` gives every node of a realm as `<world>/<node>`, with the title and requires after links and overrides, and the pack's own node unchanged beside them.

## Not in version 0

Version 0 says which worlds join, where they sit, how the player passes between them, and how their knowledge graphs join. It does not cover yet:

- placed content: land, NPCs, quests and plot, inside a world or across worlds;
- the presentation or rendering contract: how an engine draws the map, the worlds, the gates or the descent;
- saves: how a character's progress in a separate world carries over into a realm, or from one version of a realm to the next;
- merging content that overlaps between worlds. Two worlds may teach the same idea; version 0 only lets the curator retitle one so that both can be told apart.

These are later.
