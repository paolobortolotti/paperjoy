// Validates a scene and writes a single self-contained HTML file (engine + css + scene).
// Usage: node build/build.mjs <scene.json> <out.html> [--fragment | --embed-test]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const Popup = require(join(root, 'engine/popup-engine.js'));

const [scenePath, outPath, ...flags] = process.argv.slice(2);
const result = { scene: scenePath, out: outPath, ok: false, errors: [], bytes: 0 };
const done = code => { console.log(JSON.stringify(result)); process.exit(code); };
if (!scenePath || !outPath) { result.errors.push('usage: build.mjs <scene.json> <out.html> [--fragment | --embed-test]'); done(2); }

let scene;
try { scene = JSON.parse(readFileSync(scenePath, 'utf8')); }
catch (e) { result.errors.push('read: ' + e.message); done(1); }

const v = Popup.validate(scene);
result.errors = v.errors;
result.warnings = v.warnings;
if (!v.ok) done(1);

const lorem = [
  'Questa pagina contiene testo prima e dopo il libro, per controllare che il libro non blocchi lo scroll e resti nel suo riquadro.',
  'Il borgo si costruisce sul pendio: le case si appoggiano una sull\'altra, ognuna un gradino più in alto della precedente, fino alla chiesa.',
  'Scorri la pagina con la rotella o con il dito sopra il libro: la pagina deve scorrere. Il libro si apre solo con un tocco o un click.',
];
const embed = flags.includes('--embed-test');
const before = embed ? `<h1>${scene.book.title}: prova di integrazione</h1>\n` + lorem.map(p => `<p>${p}</p>`).join('\n') : '';
const after = embed ? Array.from({ length: 6 }, (_, i) => `<p>${lorem[i % 3]}</p>`).join('\n') : '';

const fill = (tpl, map) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => map[k] ?? '');
const parts = {
  TITLE: scene.book.title.replace(/</g, '&lt;'),
  CSS: readFileSync(join(root, 'engine/popup-engine.css'), 'utf8').replace(/url\(fonts\/([\w.-]+\.woff2)\)/g,
    (_, f) => `url(data:font/woff2;base64,${readFileSync(join(root, 'engine/fonts', f)).toString('base64')})`),
  ENGINE: readFileSync(join(root, 'engine/popup-engine.js'), 'utf8'),
  SCENE: JSON.stringify(scene).replace(/</g, '\\u003c'),
  BEFORE: before,
  AFTER: after,
};
// Fragment: only what goes inside an existing page. The host page keeps its own fonts, background and width.
const id = 'popup-' + (scene.book.title.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'book');
const fragment = `<!-- popup-carta: ${parts.TITLE}. Paste where the book should appear; it takes the width of its container. -->
<style>
${parts.CSS}
</style>
<div class="popup-book" id="${id}"></div>
<script type="application/json" id="${id}-scene">${parts.SCENE}</script>
<script>
${parts.ENGINE}
</script>
<script>Popup.mount(document.getElementById('${id}'), JSON.parse(document.getElementById('${id}-scene').textContent));</script>
`;
const html = flags.includes('--fragment') ? fragment : fill(readFileSync(join(root, 'build/template.html'), 'utf8'), parts);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, html);
result.ok = true;
result.bytes = Buffer.byteLength(html);
done(0);
