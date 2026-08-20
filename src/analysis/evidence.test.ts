import { describe, expect, it } from "vitest";
import { buildLogicalWorkflowGraph } from "../features/logic-map/buildLogicalWorkflowGraph";
import type { ProjectPayload } from "../types";
import { analyzeProject } from "./analyzeProject";

const fixture: ProjectPayload = {
  name: "evidence_demo",
  rootPath: "/projects/evidence_demo",
  files: [
    {
      path: "lib/main.dart",
      content: `import 'app.dart';
import 'package:flutter/widgets.dart';

void main() {
  runApp(App());
}`,
    },
    {
      path: "lib/app.dart",
      content: `class App {
  void build() {}
}`,
    },
  ],
};

describe("relationship evidence", () => {
  it("records versioned source and target ranges for Dart relationships", () => {
    const project = analyzeProject(fixture);
    const appCreation = project.relationships.find(
      (relationship) =>
        relationship.kind === "creates" && relationship.targetName === "App",
    );

    expect(appCreation).toBeDefined();
    expect(appCreation?.evidence).toMatchObject({
      provider: "dart-parser",
      confidence: "exact",
      source: {
        uri: "lib/main.dart",
        range: { startLine: 5, startColumn: 10, endColumn: 13 },
        documentVersion: expect.stringMatching(/^fnv1a-/),
      },
      target: {
        uri: "lib/app.dart",
        range: { startLine: 1, startColumn: 1 },
        documentVersion: expect.stringMatching(/^fnv1a-/),
      },
    });
  });

  it("retains exact import evidence on the visual graph", () => {
    const graph = buildLogicalWorkflowGraph(analyzeProject(fixture));
    const importEdge = graph.edges.find(
      (edge) =>
        edge.kind === "imports" && edge.target === "file:lib/app.dart",
    );

    expect(importEdge?.evidence).toMatchObject({
      provider: "dart-import-resolver",
      confidence: "exact",
      source: {
        uri: "lib/main.dart",
        range: { startLine: 1 },
      },
      target: {
        uri: "lib/app.dart",
        range: { startLine: 1 },
      },
    });
  });

  it("backs every logical edge with provider and location evidence", () => {
    const graph = buildLogicalWorkflowGraph(analyzeProject(fixture));

    expect(graph.edges.length).toBeGreaterThan(0);
    graph.edges.forEach((edge) => {
      expect(edge.evidence, edge.id).toBeDefined();
      expect(edge.evidence?.provider, edge.id).toBeTruthy();
      expect(edge.evidence?.source.uri, edge.id).toBeTruthy();
      expect(edge.evidence?.detail, edge.id).toBeTruthy();
    });
  });

  it("changes document fingerprints only when source content changes", () => {
    const initial = analyzeProject(fixture);
    const unchanged = analyzeProject({ ...fixture, files: [...fixture.files] });
    const changed = analyzeProject({
      ...fixture,
      files: fixture.files.map((file) =>
        file.path === "lib/app.dart"
          ? { ...file, content: `${file.content}\n// revision` }
          : file,
      ),
    });

    expect(unchanged.documentVersion).toBe(initial.documentVersion);
    expect(changed.documentVersion).not.toBe(initial.documentVersion);
  });
});
