export const folderIdsForPath = (path: string) => {
  const parts = path.split("/");
  parts.pop();
  return parts.map(
    (_, index) => `folder:${parts.slice(0, index + 1).join("/")}`,
  );
};
