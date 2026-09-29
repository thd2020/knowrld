import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import type { z } from "zod";
import {
  PackManifest,
  SourceFile,
  GraphFile,
  ProblemFile,
  FogFile,
  type FogPage,
  type SourceDoc,
  type GraphNode,
} from "./schema.ts";

export interface Issue {
  level: "error" | "warning";
  file: string;
  message: string;
}

export interface LoadedPack {
  dir: string;
  manifest: PackManifest;
  sources: SourceDoc[];
  nodes: GraphNode[];
  problems: ProblemFile[];
  // Optional fog.yaml: wilderness pages beyond the country. Empty when absent.
  fog?: FogPage[];
}

function yamlFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .sort()
    .map((f) => join(dir, f));
}

function read<T extends z.ZodType>(schema: T, file: string, issues: Issue[]): z.infer<T> | undefined {
  let raw: unknown;
  try {
    raw = parse(readFileSync(file, "utf8"));
  } catch (e) {
    issues.push({ level: "error", file, message: `YAML: ${(e as Error).message}` });
    return undefined;
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    for (const i of result.error.issues) {
      issues.push({ level: "error", file, message: `${i.path.join(".") || "(root)"}: ${i.message}` });
    }
    return undefined;
  }
  return result.data;
}

export function loadPack(dir: string): { pack?: LoadedPack; issues: Issue[] } {
  const issues: Issue[] = [];
  const manifestFile = join(dir, "pack.yaml");
  if (!existsSync(manifestFile)) {
    return { issues: [{ level: "error", file: manifestFile, message: "pack.yaml is missing" }] };
  }
  const manifest = read(PackManifest, manifestFile, issues);
  const sources = yamlFiles(join(dir, "sources")).flatMap((f) => read(SourceFile, f, issues)?.sources ?? []);
  const nodes = yamlFiles(join(dir, "graph")).flatMap((f) => read(GraphFile, f, issues)?.nodes ?? []);
  const problems = yamlFiles(join(dir, "problems")).flatMap((f) => {
    const p = read(ProblemFile, f, issues);
    return p ? [p] : [];
  });
  const fogFile = join(dir, "fog.yaml");
  const fog = existsSync(fogFile) ? (read(FogFile, fogFile, issues)?.pages ?? []) : [];
  if (!manifest) return { issues };
  return { pack: { dir, manifest, sources, nodes, problems, fog }, issues };
}
