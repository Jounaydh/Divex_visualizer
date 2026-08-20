import { describe, expect, it } from "vitest";
import { buildLogicalWorkflowGraph } from "../features/logic-map/buildLogicalWorkflowGraph";
import type { ProjectPayload } from "../types";
import { analyzeProject } from "./analyzeProject";

const databaseFixture: ProjectPayload = {
  name: "database_demo",
  rootPath: "/projects/database_demo",
  files: [
    {
      path: "database/schema.sql",
      content: `CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE
);

CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  author_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  FOREIGN KEY (author_id) REFERENCES users(id)
);`,
    },
    {
      path: "lib/post_repository.dart",
      content: `class PostRepository {
  Future<void> load() async {
    await db.query('posts');
  }

  Future<void> save() async {
    await db.insert('posts', {'title': 'New'});
  }
}`,
    },
  ],
};

describe("database analysis", () => {
  it("extracts SQL tables, columns, types, and keys", () => {
    const project = analyzeProject(databaseFixture);
    const schema = project.files.find((file) => file.path === "database/schema.sql");
    const posts = schema?.symbols.find(
      (symbol) => symbol.kind === "table" && symbol.name === "posts",
    );
    const postId = schema?.symbols.find(
      (symbol) =>
        symbol.kind === "column" &&
        symbol.name === "id" &&
        symbol.parentSymbolId === posts?.id,
    );

    expect(schema?.kind).toBe("sql");
    expect(schema?.symbols.filter((symbol) => symbol.kind === "table")).toHaveLength(2);
    expect(posts).toBeDefined();
    expect(postId).toMatchObject({
      dataType: "INTEGER",
      primaryKey: true,
      nullable: false,
    });
  });

  it("resolves foreign keys with exact versioned evidence", () => {
    const project = analyzeProject(databaseFixture);
    const reference = project.relationships.find(
      (relationship) => relationship.kind === "references",
    );

    expect(reference).toMatchObject({
      targetName: "users.id",
      confidence: "exact",
      evidence: {
        provider: "sql-schema-parser",
        source: {
          uri: "database/schema.sql",
          documentVersion: expect.stringMatching(/^fnv1a-/),
        },
        target: {
          uri: "database/schema.sql",
          documentVersion: expect.stringMatching(/^fnv1a-/),
        },
      },
    });
  });

  it("links Dart database reads and writes to discovered tables", () => {
    const project = analyzeProject(databaseFixture);
    const dataRelationships = project.relationships.filter(
      (relationship) =>
        relationship.kind === "reads" || relationship.kind === "writes",
    );

    expect(dataRelationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "reads",
          targetName: "posts",
          evidence: expect.objectContaining({
            provider: "dart-database-detector",
            confidence: "inferred",
          }),
        }),
        expect.objectContaining({
          kind: "writes",
          targetName: "posts",
          evidence: expect.objectContaining({
            provider: "dart-database-detector",
            confidence: "inferred",
          }),
        }),
      ]),
    );
  });

  it("adds database entities and data-flow edges to the logic graph", () => {
    const graph = buildLogicalWorkflowGraph(analyzeProject(databaseFixture));

    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "database:project", kind: "database" }),
        expect.objectContaining({ label: "posts", kind: "table" }),
        expect.objectContaining({ label: "author_id", kind: "column" }),
      ]),
    );
    expect(graph.counts.reads).toBeGreaterThan(0);
    expect(graph.counts.writes).toBeGreaterThan(0);
    expect(graph.counts.references).toBe(1);
    graph.edges.forEach((edge) => expect(edge.evidence, edge.id).toBeDefined());
  });
});
