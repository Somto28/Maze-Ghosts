// Tiny static server for the 3D example (browsers block ES modules opened straight from disk).
// npm run 3d  ->  open http://localhost:5173/examples/

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT ?? 5173);
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

http
  .createServer(async (req, res) => {
    let file = path.join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!file.startsWith(root)) return res.writeHead(403).end();
    try {
      if ((await fs.stat(file)).isDirectory()) file = path.join(file, "index.html");
      res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
      res.end(await fs.readFile(file));
    } catch {
      res.writeHead(404).end("Not found");
    }
  })
  .listen(port, () => console.log(`3D example: http://localhost:${port}/examples/`));
