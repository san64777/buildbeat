#!/usr/bin/env node
import { networkInterfaces } from "node:os";
import { DEMO_ARC, DEMO_ARC_MS, intentAt } from "./demo.ts";
import { startServer } from "./server.ts";
import { startWatch } from "./watch.ts";

const cmd = process.argv[2] ?? "watch";
const port = Number(process.env.BUILDBEAT_PORT ?? 7777);

/** Read a `--flag value` pair from argv. */
function flag(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? (process.argv[i + 1] ?? null) : null;
}

/** First non-internal IPv4 (the WSL2 IP, when on WSL), so a Windows browser
 * has a guaranteed-reachable URL even if localhost forwarding is flaky. */
function lanIp(): string | null {
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const i of ifaces ?? []) {
      if (i.family === "IPv4" && !i.internal) return i.address;
    }
  }
  return null;
}

function banner(): void {
  const ip = lanIp();
  console.log("\n  buildbeat - your codebase gets a live, adaptive soundtrack");
  console.log(`  open  http://localhost:${port}`);
  if (ip) console.log(`  or    http://${ip}:${port}   (use this from a Windows browser on WSL2)`);
  console.log("  then click once to start the audio\n");
}

if (cmd === "watch") {
  const testCommand = flag("--test");
  startWatch({ port, testCommand, log: (m) => console.log(`  ${m}`) });
  banner();
  console.log(
    testCommand
      ? `  watching this project; running "${testCommand}" on save. Ctrl-C to stop.\n`
      : '  watching saves + commits. pass --test "<cmd>" to score test runs. Ctrl-C to stop.\n',
  );
} else if (cmd === "start") {
  startServer(port);
  banner();
  console.log("  drag the tension slider on the page to morph the score. Ctrl-C to stop.\n");
} else if (cmd === "demo") {
  const server = startServer(port);
  banner();
  console.log(
    "  DEMO mode: the scripted clip arc plays from the top each time the page connects.\n",
  );

  let timers: ReturnType<typeof setTimeout>[] = [];
  const playArc = (): void => {
    for (const t of timers) clearTimeout(t);
    timers = [];
    for (const step of DEMO_ARC) {
      timers.push(
        setTimeout(() => {
          server.broadcast({
            type: "intent",
            intent: intentAt(step),
            label: step.label,
            accent: step.accent,
            endcard: step.endcard,
          });
          console.log(`  +${String(step.atMs).padStart(6)}ms  ${step.label}`);
        }, step.atMs),
      );
    }
    timers.push(setTimeout(playArc, DEMO_ARC_MS)); // loop
  };

  // (Re)start the arc from the top whenever a fresh page connects, so the audio
  // (which the user starts by clicking) is in sync with the opening calm beat.
  let prevClients = 0;
  setInterval(() => {
    const n = server.clientCount();
    if (n > 0 && prevClients === 0) {
      console.log("  page connected, rolling the arc from the top:\n");
      playArc();
    }
    prevClients = n;
  }, 200);
} else {
  console.log('usage: buildbeat [watch [--test "<cmd>"] | start | demo]');
  process.exit(1);
}
