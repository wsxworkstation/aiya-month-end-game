const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png" };

http.createServer((request, response) => {
  const urlPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const requested = path.resolve(root, `.${urlPath === "/" ? "/index.html" : urlPath}`);
  if (!requested.startsWith(root)) { response.writeHead(403).end("Forbidden"); return; }
  fs.readFile(requested, (error, data) => {
    if (error) { response.writeHead(404).end("Not found"); return; }
    response.writeHead(200, { "Content-Type": mime[path.extname(requested)] || "application/octet-stream", "Cache-Control": "no-store" });
    response.end(data);
  });
}).listen(8765, "127.0.0.1");
