
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const PORT = Number(process.env.PORT) || 3001;
const STATIC_ROOT = __dirname;
const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/manifest+json",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png"
};

function isValidDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const parsedDate = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === date;
}

const server = http.createServer(async (req, res) => {
  // Allow our frontend to communicate with this server
  res.setHeader("Access-Control-Allow-Origin", "*");

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/apod") {
    const startDate = url.searchParams.get("start_date");
    const endDate = url.searchParams.get("end_date");

    if (!isValidDate(startDate || "") || !isValidDate(endDate || "")) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Please provide valid dates in YYYY-MM-DD format." }));
      return;
    }

    if (startDate > endDate) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "The start date must be on or before the end date." }));
      return;
    }

    try {
      const entries = [];
      let totalPages = 1;

      for (let page = 1; page <= totalPages; page += 1) {
        const nasaUrl = new URL("https://science.nasa.gov/wp-json/wp/v2/apod-basic");
        nasaUrl.searchParams.set("date_from", startDate.slice(2).replaceAll("-", ""));
        nasaUrl.searchParams.set("date_to", endDate.slice(2).replaceAll("-", ""));
        nasaUrl.searchParams.set("page", String(page));

        const response = await fetch(nasaUrl);
        const rawData = await response.text();

        if (!response.ok) {
          res.writeHead(response.status, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            error: `NASA APOD request failed with status ${response.status}.`
          }));
          return;
        }

        let data;

        try {
          data = JSON.parse(rawData);
        } catch (error) {
          console.error("NASA returned an invalid JSON response:", error);
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            error: "NASA returned an invalid response. Please try again later."
          }));
          return;
        }

        if (Array.isArray(data)) {
          entries.push(...data);
        } else if (data && typeof data === "object" && !data.error) {
          entries.push(data);
        } else {
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            error: "NASA returned an invalid APOD response. Please try again later."
          }));
          return;
        }

        const reportedTotalPages = Number(response.headers.get("X-WP-TotalPages"));
        if (Number.isInteger(reportedTotalPages) && reportedTotalPages > 0) {
          totalPages = reportedTotalPages;
        }
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(entries));
    } catch (error) {
      console.error("NASA request failed:", error);
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unable to contact NASA." }));
    }

    return;
  }

  let pathname;

  try {
    pathname = decodeURIComponent(url.pathname);
  } catch (error) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Invalid URL path.");
    return;
  }

  if (pathname === "/") {
    pathname = "/index.html";
  }

  const filePath = path.resolve(STATIC_ROOT, `.${pathname}`);
  const relativePath = path.relative(STATIC_ROOT, filePath);

  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden.");
    return;
  }

  if (
    relativePath !== "index.html" &&
    relativePath !== "manifest.json" &&
    relativePath !== "service-worker.js" &&
    relativePath !== "style.css" &&
    !relativePath.startsWith(`js${path.sep}`) &&
    !relativePath.startsWith(`img${path.sep}`)
  ) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found.");
    return;
  }

  try {
    const rootRealPath = await fs.realpath(STATIC_ROOT);
    const realFilePath = await fs.realpath(filePath);
    const realRelativePath = path.relative(rootRealPath, realFilePath);

    if (
      realRelativePath === ".." ||
      realRelativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(realRelativePath)
    ) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden.");
      return;
    }

    const file = await fs.readFile(realFilePath);
    const contentType = MIME_TYPES[path.extname(realFilePath).toLowerCase()];

    if (!contentType) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found.");
      return;
    }

    res.writeHead(200, { "Content-Type": contentType });
    res.end(file);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found.");
      return;
    }

    console.error("Static file request failed:", error);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Unable to serve file.");
  }
});

server.listen(PORT, () => {
  console.log(`NASA server running on port ${PORT}`);
});
