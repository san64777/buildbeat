import { createReadStream, existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { type WebSocket, WebSocketServer } from "ws";

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webm": "video/webm",
};

/** A running buildbeat daemon: serves the localhost mini-page (which holds the
 * Web Audio session) and pushes MusicIntent to it over a WebSocket. */
export interface ServerHandle {
  port: number;
  url: string;
  /** Send a JSON message to every connected page. */
  broadcast: (msg: unknown) => void;
  /** How many pages are currently listening. */
  clientCount: () => number;
  stop: () => void;
}

export function startServer(port = 7777, greeting?: () => unknown): ServerHandle {
  const clients = new Set<WebSocket>();

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    // Opt-in clip upload: the self-recording page POSTs its webm here so the
    // daemon writes it to disk. Off unless BUILDBEAT_CLIP_OUT is set.
    if (req.method === "POST" && url.pathname === "/clip") {
      const out = process.env.BUILDBEAT_CLIP_OUT;
      if (!out) {
        res.writeHead(403).end("clip upload disabled");
        return;
      }
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        writeFile(out, Buffer.concat(chunks)).then(
          () => res.writeHead(200).end("ok"),
          () => res.writeHead(500).end("write failed"),
        );
      });
      return;
    }

    const rel = url.pathname === "/" ? "/index.html" : url.pathname;
    // Keep static serving inside PUBLIC_DIR (strip any leading "../").
    const safe = normalize(rel).replace(/^(\.\.[/\\])+/, "");
    const path = join(PUBLIC_DIR, safe);
    if (!existsSync(path)) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
    createReadStream(path).pipe(res);
  });

  // Bind all interfaces so a Windows browser can reach a WSL2 daemon.
  server.listen(port, "0.0.0.0");

  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (ws) => {
    clients.add(ws);
    // Greet a freshly connected page with the current mood so it does not sit
    // silent until the next event.
    if (greeting) ws.send(JSON.stringify(greeting()));
    ws.on("close", () => clients.delete(ws));
    ws.on("error", () => clients.delete(ws));
  });

  return {
    port,
    url: `http://localhost:${port}`,
    broadcast(msg) {
      const payload = JSON.stringify(msg);
      for (const ws of clients) {
        if (ws.readyState === ws.OPEN) ws.send(payload);
      }
    },
    clientCount: () => clients.size,
    stop() {
      for (const ws of clients) ws.terminate();
      wss.close();
      server.close();
    },
  };
}
