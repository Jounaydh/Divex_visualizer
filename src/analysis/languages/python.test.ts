import { describe, expect, it } from "vitest";
import { analyzeProject } from "../analyzeProject";

describe("Python language support", () => {
  it("finds Python imports, classes, async functions, methods, and variables", () => {
    const project = analyzeProject({
      name: "python-study",
      rootPath: "fixture",
      files: [
        {
          path: "app/main.py",
          content:
            "from .service import Service\nAPP_NAME: str = 'Divex'\n\nasync def main():\n    return Service()\n",
        },
        {
          path: "app/service.py",
          content:
            "class Service:\n    def run(self) -> bool:\n        return True\n",
        },
      ],
    });
    const main = project.files.find((file) => file.path === "app/main.py")!;
    const service = project.files.find(
      (file) => file.path === "app/service.py",
    )!;
    expect(project.languages).toContain("python");
    expect(main.resolvedImports).toEqual(["app/service.py"]);
    expect(main.symbols.map((symbol) => `${symbol.kind}:${symbol.name}`)).toEqual(
      expect.arrayContaining(["variable:APP_NAME", "function:main"]),
    );
    expect(
      service.symbols.map((symbol) => `${symbol.kind}:${symbol.name}`),
    ).toEqual(expect.arrayContaining(["class:Service", "method:run"]));
  });
});
