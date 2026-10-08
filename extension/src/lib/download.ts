import { promises as fs } from "fs";
import path from "path";
import { Config, Reaction, addToIndex, imagesDir, loadIndex, parseTags, writeImage } from "./library";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const MAX_BYTES = 60 * 1024 * 1024;

export type ImageKind = ".gif" | ".png" | ".jpg" | ".webp";

export function sniff(buf: Buffer): ImageKind | "mp4" | undefined {
  const head = buf.subarray(0, 12).toString("latin1");
  if (head.startsWith("GIF8")) return ".gif";
  if (buf[0] === 0x89 && head.slice(1, 4) === "PNG") return ".png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return ".jpg";
  if (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP") return ".webp";
  if (head.slice(4, 8) === "ftyp") {
    // AVIF/HEIC share the ftyp box but are images, not videos
    return /^(avif|avis|heic|heix|hevc|mif1|msf1)$/.test(buf.subarray(8, 12).toString("latin1")) ? undefined : "mp4";
  }
  if (head.slice(4, 8) === "wide") return "mp4";
  return undefined;
}

async function get(url: string): Promise<{ buf: Buffer; type: string; finalUrl: string }> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,image/gif,image/*;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} for ${url}`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) throw new Error("File is too large (over 60 MB)");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error("File is too large (over 60 MB)");
  return {
    buf,
    type: (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase(),
    finalUrl: res.url || url,
  };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function metaContents(html: string, keys: string[]): string[] {
  const out: string[] = [];
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = /(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (key && content && keys.includes(key)) out.push(decodeEntities(content));
  }
  return out;
}

/** Find the best media URL in an HTML page. Returns candidates, best first. */
export function extractCandidates(pageUrl: string, html: string): string[] {
  const out: string[] = [];
  const host = new URL(pageUrl).hostname;

  if (/(^|\.)giphy\.com$/.test(host)) {
    const m = /\/(?:gifs|stickers|clips|embed|media)\/(?:[^/?#]*-)?([A-Za-z0-9]+)(?:[/?#]|$)/.exec(pageUrl);
    if (m) out.push(`https://i.giphy.com/${m[1]}.gif`);
  }

  const metas = metaContents(html, [
    "og:image",
    "og:image:url",
    "og:image:secure_url",
    "twitter:image",
    "twitter:image:src",
    "contenturl",
    "thumbnailurl",
  ]);
  const jsonLd = [...html.matchAll(/"(?:contentUrl|image|url)"\s*:\s*"(https?:[^"]+?\.gif[^"]*)"/gi)].map((m) =>
    m[1].replace(/\\\//g, "/"),
  );
  const tenor = [...html.matchAll(/https?:\/\/media\d*\.tenor\.com\/[^"'\s<>\\]+?\.gif/gi)].map((m) => m[0]);
  const all = [...metas, ...jsonLd, ...tenor];

  const isGif = (u: string) => /\.gif(\?|$)/i.test(u);
  out.push(...all.filter(isGif), ...all.filter((u) => !isGif(u) && !/\.(mp4|webm)(\?|$)/i.test(u)));
  const resolved = out.flatMap((u) => {
    try {
      return [new URL(u, pageUrl).toString()];
    } catch {
      return [];
    }
  });
  return [...new Set(resolved)];
}

export interface Fetched {
  data: Buffer;
  ext: ImageKind;
  sourceUrl: string;
}

export async function fetchImage(url: string): Promise<Fetched> {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new Error("That doesn't look like a valid URL");
  }
  const { buf, type } = await get(parsed.toString());
  const kind = sniff(buf);
  if (kind && kind !== "mp4") return { data: buf, ext: kind, sourceUrl: parsed.toString() };
  if (kind === "mp4" || type.startsWith("video/"))
    throw new Error("That link is a video (mp4); only GIF, PNG, JPEG and WebP are supported");
  if (!type.includes("html") && !/^\s*</.test(buf.subarray(0, 200).toString("utf8")))
    throw new Error(`Unsupported content type: ${type || "unknown"}`);

  const candidates = extractCandidates(parsed.toString(), buf.toString("utf8"));
  if (candidates.length === 0) {
    if (/\.(mp4|webm)\b/i.test(buf.toString("utf8")))
      throw new Error("Only an mp4 video was available; only GIF, PNG, JPEG and WebP are supported");
    throw new Error("Couldn't find an image on that page");
  }
  let sawVideo = false;
  let lastErr = "";
  for (const candidate of candidates) {
    try {
      const r = await get(candidate);
      const k = sniff(r.buf);
      if (k === "mp4") {
        sawVideo = true;
        continue;
      }
      if (k) return { data: r.buf, ext: k, sourceUrl: parsed.toString() };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  if (sawVideo) throw new Error("Only an mp4 video was available; only GIF, PNG, JPEG and WebP are supported");
  throw new Error(lastErr || "Couldn't download an image from that page");
}

export interface AddInput {
  name: string;
  tags?: string | string[];
  url?: string;
  filePath?: string;
}

/** Download/read, write into the library and index it. Does not sync. */
export async function addReaction(c: Config, input: AddInput): Promise<Reaction> {
  const name = input.name.trim();
  if (!name) throw new Error("A name is required");
  let fetched: Fetched;
  if (input.filePath) {
    const data = await fs.readFile(input.filePath);
    const ext = sniff(data);
    if (!ext || ext === "mp4")
      throw new Error(`${path.basename(input.filePath)} is not a GIF, PNG, JPEG or WebP image`);
    fetched = { data, ext, sourceUrl: "" };
  } else if (input.url?.trim()) {
    fetched = await fetchImage(input.url);
  } else {
    throw new Error("Provide a URL or a file");
  }
  await loadIndex(c); // fail before writing anything if index.json is corrupt
  const file = await writeImage(c, name, fetched.ext, fetched.data);
  try {
    return await addToIndex(c, {
      name,
      tags: parseTags(input.tags),
      file,
      sourceUrl: fetched.sourceUrl || undefined,
      data: fetched.data,
    });
  } catch (e) {
    await fs.rm(path.join(imagesDir(c), file), { force: true });
    throw e;
  }
}
