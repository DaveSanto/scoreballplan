const fs = require('fs');
const path = require('path');

// Find the Ionicons TTF bundled by expo export
const assetsDir = path.join(__dirname, '../dist/assets');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((f) =>
  f.isDirectory() ? walk(path.join(dir, f.name)) : [path.join(dir, f.name)]
);
const fontFile = walk(assetsDir).find((f) => path.basename(f).startsWith('Ionicons') && f.endsWith('.ttf'));
if (!fontFile) { console.error('Ionicons TTF not found in dist/assets'); process.exit(1); }

// Copy font to a clean, simple path — avoids mobile Safari issues with @ and hashes in URLs
const fontsDir = path.join(__dirname, '../dist/fonts');
if (!fs.existsSync(fontsDir)) fs.mkdirSync(fontsDir);
fs.copyFileSync(fontFile, path.join(fontsDir, 'Ionicons.ttf'));

// Inject @font-face + preload hint into index.html
const htmlPath = path.join(__dirname, '../dist/index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const injection =
  `<link rel="preload" href="/fonts/Ionicons.ttf" as="font" type="font/ttf" crossorigin="anonymous">` +
  `<style>@font-face{font-family:Ionicons;src:url('/fonts/Ionicons.ttf')format('truetype');font-display:block;}</style>`;
fs.writeFileSync(htmlPath, html.replace('</head>', injection + '</head>'));
console.log('Patched dist/index.html — Ionicons copied to /fonts/Ionicons.ttf');

// Copy web/ static assets (surveys, etc.) into dist/
// Skip index.html and CNAME — those belong to the GitHub Pages marketing site, not the app
const webDir = path.join(__dirname, '../web');
const WEB_SKIP = new Set(['index.html', 'CNAME']);
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (!entry.isDirectory() && WEB_SKIP.has(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}
if (fs.existsSync(webDir)) {
  copyDir(webDir, path.join(__dirname, '../dist'));
  console.log('Copied web/ static assets into dist/');
}
