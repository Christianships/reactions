import { LaunchProps, Toast, showToast } from "@raycast/api";
import { addReaction } from "./lib/download";
import { getConfig } from "./lib/config";
import { syncWithToast, toastAdded } from "./lib/ui";

export default async function Command(props: LaunchProps<{ arguments: Arguments.QuickAddReaction }>) {
  const config = getConfig();
  const { url, name, tags } = props.arguments;
  const toast = await showToast({ style: Toast.Style.Animated, title: "Adding reaction…" });
  try {
    const r = await addReaction(config, { url, name, tags });
    toast.hide();
    await toastAdded(config, r);
    if (config.autoSync) await syncWithToast(config, `add: ${r.file}`, r);
  } catch (e) {
    toast.style = Toast.Style.Failure;
    toast.title = "Couldn't add reaction";
    toast.message = e instanceof Error ? e.message : String(e);
  }
}
