import { createHash } from 'node:crypto';
import { copyFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

// Pages and browsers can cache each ES module independently of the entry page.
function versionedURL(path) {
  const hash = createHash('sha256').update(readFileSync(`dist/${path}`)).digest('hex');
  return `${path}?v=${hash.slice(0, 12)}`;
}

function moduleFiles(directory) {
  return readdirSync(`dist/${directory}`, { withFileTypes: true }).flatMap(entry => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return moduleFiles(path);
    return entry.name.endsWith('.js') ? [path] : [];
  });
}

copyFileSync('styles.css', 'dist/styles.css');
const imports = Object.fromEntries(moduleFiles('./js').sort().map(path => [path, versionedURL(path)]));
const html = readFileSync('index.html', 'utf8')
  .replace('href="./styles.css"', `href="${versionedURL('./styles.css')}"`)
  .replace('<script type="module" src="./js/main.js">', `<script type="importmap">${JSON.stringify({ imports })}</script>\n  <script type="module" src="${imports['./js/main.js']}">`);
writeFileSync('dist/index.html', html);
