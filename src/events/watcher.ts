// File-save and git-commit sources. Saves come from a chokidar watch over the
// project (minus the usual noise); commits come from watching the git reflog
// (.git/logs/HEAD), so no hook install is required.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { watch } from "chokidar";
import type { BuildEvent } from "./types.ts";

const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|css|html|md)$/;
// Ignore build noise AND transient temp/swap files (atomic saves write a
// `.tmp.NNNN` sibling then rename; watching that racing file throws EINVAL).
const IGNORED =
  /(^|[/\\])(node_modules|\.git|dist|\.next|\.playwright-mcp)([/\\]|$)|\.(tmp|swp|swx|lock)(\.|$)|~$/;

/** inotify / fs.watch is unreliable on WSL2 drvfs (/mnt/*) and network mounts:
 * it misses events and can throw EINVAL on racing temp files. Poll there. */
function needsPolling(root: string): boolean {
  if (root.startsWith("/mnt/")) return true;
  try {
    return readFileSync("/proc/version", "utf8").toLowerCase().includes("microsoft");
  } catch {
    return false;
  }
}

export interface Watchers {
  close: () => Promise<void>;
}

export function watchProject(
  root: string,
  onEvent: (event: BuildEvent) => void,
  onSave?: () => void,
): Watchers {
  const polling = needsPolling(root);
  const source = watch(".", {
    cwd: root,
    ignoreInitial: true,
    ignored: (p: string) => IGNORED.test(p),
    usePolling: polling,
    interval: 300,
    binaryInterval: 600,
    // Wait for a save to settle so atomic writes fire one clean event.
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
  });
  // A single failed watch must never crash the daemon.
  source.on("error", () => {});
  const onChange = (path: string): void => {
    if (!SOURCE_EXT.test(path)) return;
    onEvent({ kind: "save", path });
    onSave?.();
  };
  source.on("add", onChange);
  source.on("change", onChange);

  // Git commits via the reflog. The last line's action tells us what happened.
  const headLog = join(root, ".git", "logs", "HEAD");
  const git = watch(headLog, { ignoreInitial: true, usePolling: polling, interval: 300 });
  git.on("error", () => {});
  const onGit = (): void => {
    try {
      const lines = readFileSync(headLog, "utf8").trimEnd().split("\n");
      const last = lines[lines.length - 1] ?? "";
      const action = last.split("\t")[1] ?? "";
      if (action.startsWith("commit")) {
        onEvent({ kind: "commit", message: action.slice(action.indexOf(":") + 1).trim() });
      }
    } catch {
      // reflog may not exist yet (no commits); ignore.
    }
  };
  git.on("add", onGit);
  git.on("change", onGit);

  return {
    async close() {
      await source.close();
      await git.close();
    },
  };
}
