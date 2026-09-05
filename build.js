const fs = require("fs");
const path = require("path");

const root = __dirname;
const dist = path.join(root, "dist");

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

const skip = new Set(["dist", ".git", "node_modules"]);

function copy(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      if (skip.has(entry)) continue;
      copy(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

for (const entry of fs.readdirSync(root)) {
  if (skip.has(entry)) continue;
  copy(path.join(root, entry), path.join(dist, entry));
}

console.log("Built static SPIKE site to dist/");
