import { getPreferenceValues } from "@raycast/api";
import { Config, expandHome } from "./library";

export function getConfig(): Config {
  const p = getPreferenceValues<Preferences>();
  return {
    libraryPath: expandHome(p.libraryPath || "~/Developer/reactions"),
    githubRepo: p.githubRepo || "Christianships/reactions",
    branch: p.branch || "main",
    autoSync: p.autoSync ?? true,
  };
}
