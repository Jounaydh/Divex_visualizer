import { describe, expect, it } from "vitest";
import { analyzeProject } from "../../analysis/analyzeProject";
import { sampleProject } from "../../data/sampleProject";
import {
  definitionTarget,
  findProjectReferences,
  searchProjectFiles,
  searchProjectSymbols,
  searchProjectText,
} from "./navigationIndex";

const project = analyzeProject(sampleProject);

describe("navigation index", () => {
  it("finds files, symbols, and source text", () => {
    expect(searchProjectFiles(project, "home")[0]).toMatchObject({
      path: "lib/screens/home_page.dart",
    });
    expect(searchProjectSymbols(project, "DiveService")[0]).toMatchObject({
      title: "DiveService",
      path: "lib/services/dive_service.dart",
    });
    expect(searchProjectText(project, "MaterialApp")[0]).toMatchObject({
      path: "lib/app.dart",
      line: 9,
    });
  });

  it("resolves definitions and incoming references", () => {
    const symbol = project.files
      .flatMap((file) => file.symbols)
      .find((candidate) => candidate.name === "DivexDemo");
    expect(symbol).toBeDefined();
    expect(definitionTarget(project, symbol?.id ?? null)).toMatchObject({
      kind: "symbol",
      path: "lib/app.dart",
      line: 4,
    });
    expect(
      findProjectReferences(project, symbol?.id ?? null).length,
    ).toBeGreaterThan(0);

    const service = project.files
      .flatMap((file) => file.symbols)
      .find((candidate) => candidate.name === "DiveService");
    expect(findProjectReferences(project, service?.id ?? null)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "lib/screens/home_page.dart",
          line: 14,
        }),
      ]),
    );
  });
});
