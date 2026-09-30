// Pack format v0. A pack is a folder of YAML files; these schemas describe each file.
import { z } from "zod";

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "ids are lowercase kebab-case");

export const Region = z.object({
  id,
  title: z.string(),
  summary: z.string(),
});

export const PackManifest = z.object({
  format: z.literal(0),
  id,
  title: z.string(),
  version: z.string(),
  summary: z.string(),
  // SPDX id of the pack's own content licence.
  license: z.string(),
  // Where the level structure comes from, e.g. the MDN Curriculum.
  blueprint: z.object({ title: z.string(), url: z.url(), license: z.string() }),
  regions: z.array(Region).min(1),
  // The deepest project node; the final boss.
  final: id,
});

export const Excerpt = z.object({
  id,
  // Verbatim text from the source file at the pinned commit, including MDN macros.
  text: z.string().min(1),
  verbatim: z.boolean(),
  // Line range in the source file, so the excerpt can be re-verified upstream.
  lines: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),
});

export const SourceDoc = z.object({
  id,
  title: z.string(),
  url: z.url(),
  publisher: z.string(),
  license: z.string(),
  retrieved: z.iso.date(),
  // Raw file the excerpts were cut from, pinned to a commit.
  raw: z.url().optional(),
  excerpts: z.array(Excerpt).min(1),
});

export const SourceFile = z.object({ sources: z.array(SourceDoc).min(1) });

export const CheckItem = z.object({
  prompt: z.string(),
  choices: z.array(z.string()).min(2),
  answer: z.number().int().nonnegative(),
  explain: z.string(),
});

// Where a node sits in its region: on the main road (the region's core
// curriculum pages) or in the country around it (reference pages one link away).
export const Tier = z.enum(["road", "country"]);

const NodeBase = z.object({
  id,
  title: z.string(),
  region: id,
  // Optional; packs without tiers treat every node as road.
  tier: Tier.optional(),
  requires: z.array(id).default([]),
  // References to excerpts as "<source-id>#<excerpt-id>".
  cites: z.array(z.string().regex(/^[a-z0-9-]+#[a-z0-9-]+$/)).default([]),
});

export const ConceptNode = NodeBase.extend({
  kind: z.literal("concept"),
  says: z.string(),
  check: z.array(CheckItem).min(1),
});

export const ProblemNode = NodeBase.extend({
  kind: z.enum(["problem", "project"]),
  problem: id,
  // One line saying what the player must do; the problem file holds the full statement.
  intent: z.string().optional(),
  // True while the problem file has not been written yet. A missing problem is then
  // a warning instead of an error, so a graph can be drafted before its graders.
  planned: z.boolean().optional(),
});

export const GraphNode = z.discriminatedUnion("kind", [ConceptNode, ProblemNode]);
export const GraphFile = z.object({ nodes: z.array(GraphNode).min(1) });

// A text test: regular expressions (case-insensitive) that the text must, or must not, match.
const TextTest = z.object({ matches: z.string().optional(), not: z.string().optional() });

// One step of a `next` sequence: the following sibling (skipping whitespace-only text and
// comments) is an element matching `is` and `text`. With `absent: true` the step instead
// requires that no such sibling follows, and it must be the last step.
const NextStep = z.object({
  is: z.string().optional(),
  text: TextTest.optional(),
  absent: z.literal(true).optional(),
});

// One declarative assertion against the rendered page. Data, not code, so the
// validator can read every grader and packs cannot ship scripts in v0.
//
// Selection: `selector` (CSS), then `within` (an ancestor), `role` (the element's computed
// ARIA role, implicit or explicit; with no selector, every element with that role) and
// `first` (keep only the first match in document order). Then `count` bounds the selection.
// Set assertions over the whole selection: `unique`. Element assertions, which must hold for
// one element, or for every element with `every: true`: `attr`, `text`, `name`, `style`,
// `datetime`, `outline`, `next`, `precedes`, `resolves`. Document assertions: `doctype`,
// `axe`. In a multi-page problem, `pages` limits a check to some pages and `pooled` selects
// across those pages together instead of page by page.
export const DomCheck = z
  .object({
    id,
    says: z.string(),
    doctype: z.literal(true).optional(),
    selector: z.string().optional(),
    role: z.string().regex(/^[a-z]+$/).optional(),
    first: z.literal(true).optional(),
    count: z
      .object({ min: z.number().int().optional(), max: z.number().int().optional() })
      .optional(),
    every: z.boolean().optional(),
    within: z.string().optional(),
    attr: z
      .object({
        name: z.string(),
        present: z.boolean().optional(),
        equals: z.string().optional(),
        matches: z.string().optional(),
      })
      .optional(),
    // `own: true` tests only the element's own text nodes, not its descendants' text. Text never
    // includes the contents of script, style, template or noscript elements.
    // `following: true` appends the text that follows the element within its parent, to test what
    // comes right after it (an abbreviation's expansion in brackets, say).
    text: TextTest.extend({ own: z.literal(true).optional(), following: z.literal(true).optional() }).optional(),
    // Keep only rendered elements, and read `text` from rendered content only. Rendering is judged
    // from the DOM alone (see isRendered): hidden, closed details, display: none, visibility: hidden,
    // opacity: 0 and font-size: 0 hide; off-screen or clipped text does not.
    rendered: z.literal(true).optional(),
    // The element is a heading whose parent in the heading outline (the nearest earlier heading of
    // a higher rank) has text that passes this test.
    under: TextTest.optional(),
    style: z.object({ property: z.string(), equals: z.string() }).optional(),
    // The element's accessible name, computed as assistive technology would (a subset of accname 1.2).
    name: TextTest.optional(),
    // The element's machine-readable date or time (its datetime attribute, else its text) is a
    // valid HTML date, time, week, year, duration or date-and-time string.
    datetime: z.literal(true).optional(),
    // The headings inside the element, in document order, never skip a level going down;
    // with `start`, the first heading is at that level.
    outline: z.object({ start: z.number().int().min(1).max(6).optional() }).optional(),
    // The siblings after the element, in order.
    next: z.array(NextStep).min(1).optional(),
    // The element comes before every element matching this selector, in document order.
    precedes: z.string().optional(),
    // No two selected elements share a value of this attribute ("text": of their text).
    unique: z.string().optional(),
    // The element's href leads to a page or file of the site, and its #fragment to an existing id there.
    // With `page`, it must lead to that page of the problem; with `to`, the fragment's element must match `to`.
    resolves: z.union([z.literal(true), z.object({ page: id.optional(), to: z.string().optional() })]).optional(),
    // axe-core rule ids that must report no violations on the page. The pack only names the
    // rules; the engine that hosts the grader runs them (see docs/pack-format.md).
    axe: z.array(z.string().regex(/^[a-z0-9-]+$/)).min(1).optional(),
    pages: z.array(id).min(1).optional(),
    pooled: z.literal(true).optional(),
    // Graph nodes whose teaching this check assesses; the validator checks they exist.
    concepts: z.array(id).optional(),
  })
  .refine((c) => c.doctype || c.selector || c.role || c.axe, "a check needs a selector, a role, axe rules or doctype: true")
  .refine((c) => !c.next || c.next.every((s, i) => !s.absent || i === c.next!.length - 1), "only the last next step may be absent");

// Pages a region lists but does not quote, drawn as fog at its edge. `country` pages are one link from the road
// and on the region's subject; `wilderness` pages lie further out, and `home` names the later region, if any,
// that a wilderness page belongs to (free text, since that region may not exist in any pack yet).
export const FogPage = z.object({
  slug: z.string().min(1),
  title: z.string(),
  region: id,
  tier: z.enum(["country", "wilderness"]),
  home: id.optional(),
  url: z.url(),
});
export const FogFile = z.object({ pages: z.array(FogPage) });

const Code = z.object({ html: z.string(), css: z.string().default("") });

// A page of a multi-page problem, served at `path` on the problem's site.
export const ProblemPage = z.object({
  id,
  path: z.string().regex(/^\/[^?#\s]*$/, "a page path starts with / and has no query or fragment"),
  title: z.string(),
  starter: Code,
  solution: Code,
});

// Another file on the problem's site, so `resolves` can tell a working link from a broken one.
// `ids` lists the fragment targets inside it, if it is a page the player does not edit.
export const SiteFile = z.object({
  path: z.string().regex(/^\/[^?#\s]*$/),
  ids: z.array(z.string()).optional(),
});

// A graded stage of a project; all its checks must pass for the stage to fall.
export const Stage = z.object({ id, title: z.string(), says: z.string(), checks: z.array(DomCheck).min(1) });

// Changes to the reference solution that make a test fixture: each `find` must occur in it.
const Edit = z.object({ find: z.string().min(1), replace: z.string() });
const FixturePage = z.object({ html: z.string().optional(), css: z.string().optional(), edits: z.array(Edit).optional() });

// A test answer: a full page (`html`), or the reference solution with `edits`. In a multi-page
// problem, `pages` overrides some pages and the rest stay as the reference solution.
export const Fixture = FixturePage.extend({
  name: z.string(),
  pages: z.record(z.string(), FixturePage).optional(),
  // Wrong answers only: the checks that must fail, and why the answer is wrong.
  fails: z.array(id).optional(),
  because: z.string().optional(),
});

export const ProblemFile = z
  .object({
    id,
    statement: z.string(),
    // A single-page problem has a starter and a reference solution; a multi-page one has `pages`.
    starter: Code.optional(),
    // A reference answer. Tests require it to pass every check and the starter to fail one.
    solution: Code.optional(),
    pages: z.array(ProblemPage).min(1).optional(),
    // Where a single-page problem's page sits on its site (default /index.html).
    path: z.string().regex(/^\/[^?#\s]*$/).optional(),
    files: z.array(SiteFile).optional(),
    // Either one list of checks or a sequence of stages.
    grader: z
      .object({ type: z.literal("dom"), checks: z.array(DomCheck).min(1).optional(), stages: z.array(Stage).min(1).optional() })
      .refine((g) => !!g.checks !== !!g.stages, "a grader has either checks or stages"),
    // Answers other than the reference that must pass, and wrong ones that must fail. Tests only;
    // never shipped to players.
    fixtures: z.object({ pass: z.array(Fixture).default([]), fail: z.array(Fixture).default([]) }).optional(),
  })
  .refine((p) => (p.pages ? !p.starter && !p.solution && !p.path : !!p.starter && !!p.solution), "a problem has a starter and a solution, or pages (not both)");

export type PackManifest = z.infer<typeof PackManifest>;
export type SourceDoc = z.infer<typeof SourceDoc>;
export type Excerpt = z.infer<typeof Excerpt>;
export type GraphNode = z.infer<typeof GraphNode>;
export type CheckItem = z.infer<typeof CheckItem>;
export type DomCheck = z.infer<typeof DomCheck>;
export type ProblemFile = z.infer<typeof ProblemFile>;
export type FogPage = z.infer<typeof FogPage>;
export type ProblemPage = z.infer<typeof ProblemPage>;
export type SiteFile = z.infer<typeof SiteFile>;
export type Stage = z.infer<typeof Stage>;
export type Fixture = z.infer<typeof Fixture>;
