import { getConfig } from "./lib/config";
import { syncWithToast } from "./lib/ui";

export default async function Command() {
  await syncWithToast(getConfig(), "sync: library");
}
