// Shared by Home and its Admin preview; Auth keeps its existing background.
export const HOME_DEFAULT_BACKGROUND = "linear-gradient(125deg,#143b39,#203347 65%,#866448)";
export function homeBackgroundFile(journeyFile: string | null | undefined, adminFile: string | null, failed: Readonly<Record<string, boolean>> = {}): string | null {
  if (journeyFile && !failed[journeyFile]) return journeyFile;
  if (adminFile && !failed[adminFile]) return adminFile;
  return null;
}
