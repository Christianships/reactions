import { Clipboard, Toast, showToast } from "@raycast/api";
import { sync } from "./git";
import { Config, Reaction, rawUrl } from "./library";

/** Sync with toasts. Never throws; local changes are kept on failure. */
export async function syncWithToast(c: Config, message: string, reaction?: Reaction): Promise<boolean> {
  const toast = await showToast({ style: Toast.Style.Animated, title: "Syncing to GitHub…" });
  try {
    const r = await sync(c, message);
    toast.style = Toast.Style.Success;
    toast.title = r.pushed ? "Synced to GitHub" : "Saved locally (no remote)";
    if (reaction) toast.primaryAction = copyUrlToastAction(c, reaction);
    return true;
  } catch (e) {
    toast.style = Toast.Style.Failure;
    toast.title = "Saved locally, sync failed";
    toast.message = e instanceof Error ? e.message.slice(0, 300) : String(e);
    if (reaction) toast.primaryAction = copyUrlToastAction(c, reaction);
    return false;
  }
}

export function copyUrlToastAction(c: Config, r: Reaction): Toast.ActionOptions {
  return {
    title: "Copy URL",
    shortcut: { modifiers: ["cmd", "shift"], key: "c" },
    onAction: async (t) => {
      await Clipboard.copy(rawUrl(c, r));
      t.hide();
    },
  };
}

export async function toastAdded(c: Config, r: Reaction) {
  await showToast({
    style: Toast.Style.Success,
    title: `Added ${r.file}`,
    primaryAction: copyUrlToastAction(c, r),
  });
}
