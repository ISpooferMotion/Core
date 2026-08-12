import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const generatedDirectory = join(directory, ".tmp");
const port = Number(process.env.PORT ?? 4173);

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ISM browser fixture</title>
  <link rel="stylesheet" href="/fixture.css">
  <style>
    html, body { margin: 0; min-height: 100%; font-family: system-ui, sans-serif; }
    body { min-height: 100vh; }
    #surface { margin: 40px; width: max-content; }
    button, [role="button"] { font: inherit; }
  </style>
</head>
<body>
  <main id="surface" aria-label="Browser test surface">
    <div id="root"></div>
  </main>
  <script src="/fixture.js"></script>
</body>
</html>`;

const sendFile = async (response, fileName, contentType) => {
	const path = join(generatedDirectory, fileName);
	try {
		await access(path);
		response.writeHead(200, { "content-type": contentType });
		createReadStream(path).pipe(response);
	} catch {
		response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
		response.end(`Missing generated browser fixture: ${fileName}`);
	}
};

const server = createServer(async (request, response) => {
	const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
	if (url.pathname === "/health") {
		response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
		response.end("ok");
		return;
	}
	if (url.pathname === "/fixture.js") {
		await sendFile(response, "fixture.js", "text/javascript; charset=utf-8");
		return;
	}
	if (url.pathname === "/fixture.css") {
		await sendFile(response, "fixture.css", "text/css; charset=utf-8");
		return;
	}
	response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
	response.end(html);
});

server.listen(port, "127.0.0.1");

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
