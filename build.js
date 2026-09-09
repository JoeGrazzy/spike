const fs = require("fs");
const path = require("path");

const root = __dirname;
const dist = path.join(root, "dist");

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

const copyFile = (src, dest) => {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
};

// Production is a strict allow-list: never publish audit code, SQL migrations,
// package metadata, source backups, or internal/legal working files.
for (const entry of fs.readdirSync(root)) {
  if (/\.pre-rebuild\.html$/i.test(entry)) continue;
  const src = path.join(root, entry);
  const stat = fs.statSync(src);
  if (stat.isFile() && entry.endsWith(".html")) copyFile(src, path.join(dist, entry));
}

for (const dir of ["css", "assets"]) {
  const srcDir = path.join(root, dir);
  if (fs.existsSync(srcDir)) {
    fs.cpSync(srcDir, path.join(dist, dir), { recursive: true });
  }
}

const jsDir = path.join(root, "js");
if (fs.existsSync(jsDir)) {
  fs.mkdirSync(path.join(dist, "js"), { recursive: true });
  for (const entry of fs.readdirSync(jsDir)) {
    if (entry === "audit") continue;
    const src = path.join(jsDir, entry);
    fs.cpSync(src, path.join(dist, "js", entry), { recursive: true });
  }
}

if (fs.existsSync(path.join(root, "_headers"))) copyFile(path.join(root, "_headers"), path.join(dist, "_headers"));
if (fs.existsSync(path.join(root, "404.html"))) copyFile(path.join(root, "404.html"), path.join(dist, "404.html"));

console.log(`Built static SPIKE site to dist/ (${fs.readdirSync(dist).length} top-level entries)`);
