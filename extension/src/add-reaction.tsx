import { Action, ActionPanel, Clipboard, Form, Toast, popToRoot, showToast } from "@raycast/api";
import { useEffect, useState } from "react";
import { addReaction } from "./lib/download";
import { getConfig } from "./lib/config";
import { loadIndex } from "./lib/library";
import { syncWithToast, toastAdded } from "./lib/ui";

const config = getConfig();

const looksLikeUrl = (s?: string) => !!s && /^https?:\/\/\S+$/i.test(s.trim());

export default function Command() {
  const [url, setUrl] = useState("");
  const [clipFile, setClipFile] = useState<string>();
  const [existing, setExisting] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const clip = await Clipboard.read();
        if (clip.file) setClipFile(decodeURIComponent(clip.file.replace(/^file:\/\//, "")));
        else if (looksLikeUrl(clip.text)) setUrl(clip.text!.trim());
      } catch {
        // clipboard unavailable
      }
      try {
        setExisting([...new Set((await loadIndex(config)).flatMap((r) => r.tags))].sort());
      } catch {
        // ignore
      }
    })();
  }, []);

  async function submit(v: {
    url: string;
    files: string[];
    useClipboard: boolean;
    name: string;
    pickedTags: string[];
    newTags: string;
  }) {
    const toast = await showToast({ style: Toast.Style.Animated, title: "Adding reaction…" });
    setBusy(true);
    try {
      const tags = [...(v.pickedTags ?? []), ...(v.newTags ?? "").split(",")];
      const filePath = v.useClipboard && clipFile ? clipFile : v.files?.[0];
      const r = await addReaction(config, { name: v.name, tags, url: filePath ? undefined : v.url, filePath });
      toast.hide();
      await toastAdded(config, r);
      if (config.autoSync) await syncWithToast(config, `add: ${r.file}`, r);
      await popToRoot();
    } catch (e) {
      toast.style = Toast.Style.Failure;
      toast.title = "Couldn't add reaction";
      toast.message = e instanceof Error ? e.message : String(e);
      setBusy(false);
    }
  }

  return (
    <Form
      isLoading={busy}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Add Reaction" onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="url"
        title="URL"
        placeholder="GIF or page link (Giphy, Tenor, Imgur…)"
        value={url}
        onChange={setUrl}
      />
      <Form.FilePicker id="files" title="Or File" allowMultipleSelection={false} canChooseDirectories={false} />
      {clipFile && (
        <Form.Checkbox id="useClipboard" label={`Use image on clipboard (${clipFile.split("/").pop()})`} defaultValue />
      )}
      <Form.Separator />
      <Form.TextField id="name" title="Name" placeholder="sonion" />
      <Form.TagPicker id="pickedTags" title="Tags">
        {existing.map((t) => (
          <Form.TagPicker.Item key={t} value={t} title={t} />
        ))}
      </Form.TagPicker>
      <Form.TextField id="newTags" title="New Tags" placeholder="Comma separated" />
    </Form>
  );
}
