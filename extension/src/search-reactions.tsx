import {
  Action,
  ActionPanel,
  Alert,
  Clipboard,
  Form,
  Grid,
  Icon,
  Toast,
  closeMainWindow,
  confirmAlert,
  showToast,
  useNavigation,
  Keyboard,
} from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useMemo, useState } from "react";
import { getConfig } from "./lib/config";
import {
  Config,
  Reaction,
  deleteReaction,
  githubPageUrl,
  imagePath,
  loadIndex,
  parseTags,
  rawUrl,
  updateReaction,
} from "./lib/library";
import { syncWithToast } from "./lib/ui";

const config = getConfig();

function EditForm({ reaction, onDone }: { reaction: Reaction; onDone: () => void }) {
  const { pop } = useNavigation();
  return (
    <Form
      navigationTitle={`Edit ${reaction.name}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save"
            onSubmit={async (v: { name: string; tags: string }) => {
              const name = v.name.trim();
              if (!name) {
                await showToast({ style: Toast.Style.Failure, title: "Name is required" });
                return false;
              }
              await updateReaction(config, reaction.id, { name, tags: parseTags(v.tags) });
              onDone();
              pop();
              if (config.autoSync) await syncWithToast(config, `edit: ${reaction.file}`);
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="name" title="Name" defaultValue={reaction.name} />
      <Form.TextField id="tags" title="Tags" info="Comma separated" defaultValue={reaction.tags.join(", ")} />
    </Form>
  );
}

async function paste(c: Config, r: Reaction) {
  try {
    await Clipboard.paste({ file: imagePath(c, r) });
    await closeMainWindow();
  } catch (e) {
    await showToast({ style: Toast.Style.Failure, title: "Paste failed", message: String(e) });
  }
}

export default function Command() {
  const { data, isLoading, revalidate } = usePromise(() => loadIndex(config));
  const [tag, setTag] = useState("all");

  const items = useMemo(
    () =>
      [...(data ?? [])]
        .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
        .filter((r) => tag === "all" || r.tags.includes(tag)),
    [data, tag],
  );
  const allTags = useMemo(() => [...new Set((data ?? []).flatMap((r) => r.tags))].sort(), [data]);

  return (
    <Grid
      columns={5}
      aspectRatio="4/3"
      fit={Grid.Fit.Contain}
      isLoading={isLoading}
      searchBarPlaceholder="Search reactions by name or tag…"
      searchBarAccessory={
        <Grid.Dropdown tooltip="Filter by tag" value={tag} onChange={setTag}>
          <Grid.Dropdown.Item title="All Tags" value="all" />
          {allTags.map((t) => (
            <Grid.Dropdown.Item key={t} title={t} value={t} />
          ))}
        </Grid.Dropdown>
      }
    >
      <Grid.EmptyView
        icon={Icon.Emoji}
        title="No reactions yet"
        description="Use the Add Reaction command to save your first one."
      />
      {items.map((r) => {
        const path = imagePath(config, r);
        const url = rawUrl(config, r);
        return (
          <Grid.Item
            key={r.id}
            title={r.name}
            subtitle={r.tags.join(", ")}
            keywords={[...r.tags, r.file]}
            content={path}
            quickLook={{ path, name: r.name }}
            actions={
              <ActionPanel>
                <Action title="Paste Image" icon={Icon.Clipboard} onAction={() => paste(config, r)} />
                <Action.CopyToClipboard
                  title="Copy Image"
                  content={{ file: path }}
                  shortcut={{ modifiers: ["cmd"], key: "c" }}
                />
                <Action.CopyToClipboard title="Copy URL" content={url} shortcut={Keyboard.Shortcut.Common.Copy} />
                <Action.Paste title="Paste URL" content={url} shortcut={{ modifiers: ["cmd", "shift"], key: "v" }} />
                <Action.CopyToClipboard
                  title="Copy Markdown"
                  content={`![${r.name}](${url})`}
                  shortcut={Keyboard.Shortcut.Common.CopyName}
                />
                <ActionPanel.Section>
                  <Action.ToggleQuickLook shortcut={Keyboard.Shortcut.Common.ToggleQuickLook} />
                  <Action.ShowInFinder path={path} shortcut={{ modifiers: ["cmd", "shift"], key: "f" }} />
                  <Action.OpenInBrowser
                    title="Open in Browser"
                    url={githubPageUrl(config, r)}
                    shortcut={Keyboard.Shortcut.Common.Open}
                  />
                </ActionPanel.Section>
                <ActionPanel.Section>
                  <Action.Push
                    title="Edit Name and Tags"
                    icon={Icon.Pencil}
                    shortcut={Keyboard.Shortcut.Common.Edit}
                    target={<EditForm reaction={r} onDone={revalidate} />}
                  />
                  <Action
                    title="Delete Reaction"
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    shortcut={{ modifiers: ["ctrl"], key: "x" }}
                    onAction={async () => {
                      if (
                        !(await confirmAlert({
                          title: `Delete "${r.name}"?`,
                          message: "The image is removed from your library and from GitHub on the next sync.",
                          primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
                        }))
                      )
                        return;
                      await deleteReaction(config, r.id);
                      revalidate();
                      if (config.autoSync) await syncWithToast(config, `remove: ${r.file}`);
                    }}
                  />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        );
      })}
    </Grid>
  );
}
