export function monacoLanguageForExtension(extension: string) {
  const languages: Record<string, string> = {
    dart: "dart",
    java: "java",
    json: "json",
    py: "python",
    python: "python",
    sql: "sql",
    yaml: "yaml",
    yml: "yaml",
  };
  return languages[extension.toLowerCase()] ?? "plaintext";
}

