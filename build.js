const fs = require('fs');
const path = require('path');

const root = __dirname;
const dist = path.join(root, 'dist');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

function copy(source, target) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const item of fs.readdirSync(source)) {
      if (item === 'dist' || item === '.git' || item === 'node_modules') continue;
      copy(path.join(source, item), path.join(target, item));
    }
  } else {
    fs.copyFileSync(source, target);
  }
}

for (const item of fs.readdirSync(root)) {
  if (item === 'dist' || item === '.git' || item === 'node_modules') continue;
  copy(path.join(root, item), path.join(dist, item));
}

console.log('SPIKE static site built successfully to dist/');
