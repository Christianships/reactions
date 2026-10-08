import { promises as fs } from "fs";
import os from "os";
import path from "path";

export interface Reaction {
  id: string;
  name: string;
  tags: string[];
  file: string;
  sourceUrl?: string;
  addedAt: string;
  width?: number;
  height?: number;
  bytes: number;
}

export interface Config {
  libraryPath: string;
  githubRepo: string;
  branch: string;
  autoSync: boolean;
}

export function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

export const imagesDir = (c: Config) => path.join(c.libraryPath, "library", "images");
export const indexPath = (c: Config) => path.join(c.libraryPath, "library", "index.json");
export const imagePath = (c: Config, r: Reaction) => path.join(imagesDir(c), r.file);

export function rawUrl(c: Config, r: Reaction): string {
  return `https://raw.githubusercontent.com/${c.githubRepo}/${c.branch}/library/images/${encodeURIComponent(r.file)}`;
}

export function githubPageUrl(c: Config, r: Reaction): string {
  return `https://github.com/${c.githubRepo}/blob/${c.branch}/library/images/${encodeURIComponent(r.file)}`;
}

export async function loadIndex(c: Config): Promise<Reaction[]> {
  try {
    const data = JSON.parse(await fs.readFile(indexPath(c), "utf8"));
    if (!Array.isArray(data)) throw new Error("not an array");
    return data
      .filter((r) => r && typeof r.id === "string" && typeof r.file === "string")
      .map((r) => ({
        ...r,
        name: typeof r.name === "string" ? r.name : r.file,
        tags: Array.isArray(r.tags) ? r.tags.filter((t: unknown) => typeof t === "string") : [],
        addedAt: typeof r.addedAt === "string" ? r.addedAt : "",
      }));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    if (e instanceof SyntaxError || (e instanceof Error && e.message === "not an array"))
      throw new Error(`${indexPath(c)} is corrupt; fix or restore it (git checkout library/index.json)`);
    throw e;
  }
}

export async function saveIndex(c: Config, items: Reaction[]): Promise<void> {
  const file = indexPath(c);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(items, null, 2) + "\n");
  await fs.rename(tmp, file);
}

export function slugify(name: string): string {
  const s = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.slice(0, 80) || "reaction";
}

export function parseTags(input: string | string[] | undefined): string[] {
  const list = Array.isArray(input) ? input : (input ?? "").split(",");
  const seen = new Set<string>();
  for (const t of list) {
    const tag = t.trim().toLowerCase();
    if (tag) seen.add(tag);
  }
  return [...seen];
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Write bytes to images/<slug><ext>, deduping with -2, -3... Returns the file name. */
export async function writeImage(c: Config, name: string, ext: string, data: Buffer): Promise<string> {
  const dir = imagesDir(c);
  await fs.mkdir(dir, { recursive: true });
  const base = slugify(name);
  let file = `${base}${ext}`;
  for (let n = 2; await exists(path.join(dir, file)); n++) file = `${base}-${n}${ext}`;
  await fs.writeFile(path.join(dir, file), data, { flag: "wx" });
  return file;
}

export function imageSize(buf: Buffer): { width?: number; height?: number } {
  try {
    if (buf.subarray(0, 4).toString("latin1") === "GIF8")
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    if (buf.subarray(1, 4).toString("latin1") === "PNG")
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") {
      const kind = buf.subarray(12, 16).toString("latin1");
      if (kind === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
      if (kind === "VP8L") {
        const b = buf.readUInt32LE(21);
        return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
      }
      if (kind === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) break;
        const m = buf[i + 1];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
  } catch {
    // ignore
  }
  return {};
}

export async function addToIndex(
  c: Config,
  input: { name: string; tags: string[]; file: string; sourceUrl?: string; data: Buffer },
): Promise<Reaction> {
  const items = await loadIndex(c);
  const reaction: Reaction = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: input.name,
    tags: input.tags,
    file: input.file,
    ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
    addedAt: new Date().toISOString(),
    ...imageSize(input.data),
    bytes: input.data.length,
  };
  items.push(reaction);
  await saveIndex(c, items);
  return reaction;
}

export async function updateReaction(c: Config, id: string, patch: { name?: string; tags?: string[] }) {
  const items = await loadIndex(c);
  const item = items.find((r) => r.id === id);
  if (!item) throw new Error("Reaction not found");
  if (patch.name !== undefined) item.name = patch.name;
  if (patch.tags !== undefined) item.tags = patch.tags;
  await saveIndex(c, items);
  return item;
}

export async function deleteReaction(c: Config, id: string): Promise<Reaction | undefined> {
  const items = await loadIndex(c);
  const item = items.find((r) => r.id === id);
  if (!item) return undefined;
  await saveIndex(
    c,
    items.filter((r) => r.id !== id),
  );
  await fs.rm(imagePath(c, item), { force: true });
  return item;
}
