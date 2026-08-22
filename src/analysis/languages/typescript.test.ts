import { describe, expect, it } from "vitest";
import { analyzeProject } from "../analyzeProject";

describe("TypeScript language support", () => {
  it("finds TypeScript declarations, typed functions, TSX components, and local imports", () => {
    const project = analyzeProject({
      name: "typescript-study",
      rootPath: "fixture",
      files: [
        {
          path: "src/types.ts",
          content: [
            "export interface UserService {",
            "  load(id: string): Promise<User>;",
            "}",
            "export type User = { id: string };",
            "export enum Status { Ready, Loading }",
            "export namespace Api { export const version = 1; }",
          ].join("\n"),
        },
        {
          path: "src/service.ts",
          content: [
            "import type { User, UserService } from './types';",
            "export class Service implements UserService {",
            "  constructor(private readonly baseUrl: string) {}",
            "  async load<T extends User>(id: string): Promise<T> { throw new Error(id); }",
            "}",
            "export const createService: (url: string) => Service = (url) => new Service(url);",
          ].join("\n"),
        },
        {
          path: "src/App.tsx",
          content: [
            "import { createService } from './service';",
            "type Props = { name: string };",
            "export const App: React.FC<Props> = ({ name }) => <main>{name}</main>;",
          ].join("\n"),
        },
      ],
    });

    expect(project.languages).toEqual(["typescript"]);
    expect(project.languageSummary).toBe("TypeScript");
    const byPath = new Map(project.files.map((file) => [file.path, file]));
    const declarations = byPath.get("src/types.ts")!;
    expect(declarations.symbols.map((symbol) => `${symbol.kind}:${symbol.name}`)).toEqual(
      expect.arrayContaining([
        "interface:UserService",
        "method:load",
        "type:User",
        "enum:Status",
        "namespace:Api",
      ]),
    );
    const service = byPath.get("src/service.ts")!;
    expect(service.resolvedImports).toEqual(["src/types.ts"]);
    expect(service.symbols.map((symbol) => `${symbol.kind}:${symbol.name}`)).toEqual(
      expect.arrayContaining([
        "class:Service",
        "constructor:constructor",
        "method:load",
        "function:createService",
      ]),
    );
    const component = byPath.get("src/App.tsx")!;
    expect(component.resolvedImports).toEqual(["src/service.ts"]);
    expect(component.symbols.map((symbol) => `${symbol.kind}:${symbol.name}`)).toEqual(
      expect.arrayContaining(["type:Props", "function:App"]),
    );
  });
});
