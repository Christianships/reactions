import { execFile } from "child_process";
import { promises as fs } from "fs";
import { Config } from "./library";

const PATH = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", process.env.PATH].filter(Boolean).join(":");

function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      { cwd, env: { ...process.env, PATH, GIT_TERMINAL_PROMPT: "0" }, timeout: 120_000 },
      (err, stdout, stderr) => {
        if (err) reject(new Error((stderr || stdout || err.message).toString().trim()));
        else resolve(stdout.toString());
      },
    );
  });
}

let chain: Promise<unknown> = Promise.resolve();

export interface SyncResult {
  committed: boolean;
  pushed: boolean;
}

/** Commit library changes, pull --rebase, push. Serialized in-process. */
export function sync(c: Config, message: string): Promise<SyncResult> {
  const run = chain.then(() => doSync(c, message));
  chain = run.catch(() => undefined);
  return run;
}

async function doSync(c: Config, message: string): Promise<SyncResult> {
  const cwd = c.libraryPath;
  try {
    await fs.access(`${cwd}/.git`);
  } catch {
    throw new Error(`${cwd} is not a git checkout`);
  }
  await git(cwd, ["add", "library"]);
  let committed = false;
  // Only library/ is committed, even if something else is already staged
  const staged = await git(cwd, ["diff", "--cached", "--name-only", "--", "library"]);
  if (staged.trim()) {
    await git(cwd, ["commit", "-m", message, "--", "library"]);
    committed = true;
  }
  const hasRemote = (await git(cwd, ["remote"])).trim().length > 0;
  if (!hasRemote) return { committed, pushed: false };
  await git(cwd, ["pull", "--rebase", "--autostash", "origin", c.branch]);
  await git(cwd, ["push", "origin", `HEAD:${c.branch}`]);
  return { committed, pushed: true };
}
