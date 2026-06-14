const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const preferredPort = Number(process.env.PORT || 8010);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const requested = pathname === "/" ? "research-pyodide-chart.html" : pathname.slice(1);
  const file = path.resolve(root, requested);

  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  fs.readFile(file, (error, content) => {
    if (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500).end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
    res.end(content);
  });
});

function listen(port, attemptsLeft = 20) {
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && attemptsLeft > 0 && !process.env.PORT) {
      console.log(`Port ${port} is busy, trying ${port + 1}...`);
      listen(port + 1, attemptsLeft - 1);
      return;
    }

    console.error(error);
    process.exit(1);
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`Research Plotter: http://127.0.0.1:${port}/`);
  });
}

listen(preferredPort);
