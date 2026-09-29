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

const NodeBase = z.object({
  id,
  title: z.string(),
  region: id,
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
});

export const GraphNode = z.discriminatedUnion("kind", [ConceptNode, ProblemNode]);
export const GraphFile = z.object({ nodes: z.array(GraphNode).min(1) });

// One declarative assertion against the rendered page. Data, not code, so the
// validator can read every grader and packs cannot ship scripts in v0.
export const DomCheck = z
  .object({
    id,
    says: z.string(),
    doctype: z.literal(true).optional(),
    selector: z.string().optional(),
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
    text: z.object({ matches: z.string().optional(), not: z.string().optional() }).optional(),
    style: z.object({ property: z.string(), equals: z.string() }).optional(),
  })
  .refine((c) => c.doctype || c.selector, "a check needs a selector or doctype: true");

export const ProblemFile = z.object({
  id,
  statement: z.string(),
  starter: z.object({ html: z.string(), css: z.string().default("") }),
  // A reference answer. Tests require it to pass every check and the starter to fail one.
  solution: z.object({ html: z.string(), css: z.string().default("") }),
  grader: z.object({ type: z.literal("dom"), checks: z.array(DomCheck).min(1) }),
});

export type PackManifest = z.infer<typeof PackManifest>;
export type SourceDoc = z.infer<typeof SourceDoc>;
export type Excerpt = z.infer<typeof Excerpt>;
export type GraphNode = z.infer<typeof GraphNode>;
export type CheckItem = z.infer<typeof CheckItem>;
export type DomCheck = z.infer<typeof DomCheck>;
export type ProblemFile = z.infer<typeof ProblemFile>;
