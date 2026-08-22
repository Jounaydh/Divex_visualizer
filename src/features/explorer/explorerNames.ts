/** Checks names against the cross-platform rules used by project mutations. */
export function isValidExplorerName(name: string) {
  return Boolean(
    name &&
      name !== "." &&
      name !== ".." &&
      !name.includes("/") &&
      !name.includes("\\") &&
      !/[<>:"|?*\u0000-\u001f]/.test(name) &&
      !/[. ]$/.test(name) &&
      !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name),
  );
}
