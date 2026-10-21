// Builds the showcase site: docs/index.html (one engine copy, every scene inlined) and docs/libri/<id>.html.
// Usage: node build/site.mjs   (run after build/build.sh has produced out/<id>.html for every book)
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const Popup = createRequire(import.meta.url)(join(root, 'engine/popup-engine.js'));
const site = join(root, 'docs');

const BOOKS = [
  { id: 'roma', ask: "Un libro pop-up di Roma: il Colosseo con l'arena da scoperchiare, San Pietro, una Vespa davanti a Trevi." },
  { id: 'venezia', ask: "Venezia in tre aperture: una gondola sul Canal Grande, Rialto, l'orologio di San Marco." },
  { id: 'firenze', ask: "Firenze: dentro la cupola del Duomo, i canottieri sotto Ponte Vecchio, il giorno e la notte dal Piazzale." },
  { id: 'genova', ask: "Genova: una nave che entra in porto sotto la Lanterna, il portone di un palazzo dei Rolli, il cielo su Boccadasse." },
  { id: 'torino', ask: "Torino: le stagioni sulle Alpi dietro la Mole, un caffè storico sotto i portici, una barca sul Po." },
  { id: 'parigi', ask: "Parigi: la Tour Eiffel dal giorno alla notte, un battello sulla Senna, il telo di un pittore a Montmartre." },
  { id: 'londra', ask: "Londra: un orologio da girare a Westminster, un bus su Tower Bridge, la metro sotto la strada." },
  { id: 'tokio', ask: "Tokio: l'omikuji di Asakusa, Shibuya che si accende di sera, uno shinkansen verso il Fuji." },
];

const KIND = { slider: 'linguetta', flap: 'sportello', wheel: 'ruota' };
const REPO = 'paolobortolotti/paperjoy';
const CLONE = `git clone https://github.com/${REPO} ~/.claude/skills/popup-carta`;
const errors = [];
const books = BOOKS.map(b => {
  const src = join(root, 'examples', b.id + '.json'), html = join(root, 'out', b.id + '.html');
  if (!existsSync(src) || !existsSync(html)) {
    const msg = `${b.id}: missing ${existsSync(src) ? html : src}`;
    if (process.argv.includes('--partial')) console.warn('skip', msg); else errors.push(msg);
    return null;
  }
  const scene = JSON.parse(readFileSync(src, 'utf8'));
  const v = Popup.validate(scene);
  if (!v.ok) { errors.push(`${b.id}: ${v.errors.join('; ')}`); return null; }
  const kinds = scene.spreads.flatMap(s => (s.pieces || []).map(p => p.type).filter(t => t in KIND));
  return { ...b, scene, title: scene.book.title, spreads: scene.spreads.length, kinds };
}).filter(Boolean);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }

mkdirSync(join(site, 'libri'), { recursive: true });
for (const f of ['favicon.svg', 'apple-touch-icon.png']) copyFileSync(join(root, 'build/assets', f), join(site, f));
for (const b of books) copyFileSync(join(root, 'out', b.id + '.html'), join(site, 'libri', b.id + '.html'));

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const css = readFileSync(join(root, 'engine/popup-engine.css'), 'utf8').replace(/url\(fonts\/([\w.-]+\.woff2)\)/g,
  (_, f) => `url(data:font/woff2;base64,${readFileSync(join(root, 'engine/fonts', f)).toString('base64')})`);
const engine = readFileSync(join(root, 'engine/popup-engine.js'), 'utf8');
const scenes = JSON.stringify(Object.fromEntries(books.map(b => [b.id, b.scene]))).replace(/</g, '\\u003c');

const cards = books.map(b => `
      <figure class="card">
        <div class="stage" data-book="${b.id}"></div>
        <figcaption><span class="ask">&ldquo;${esc(b.ask)}&rdquo;</span> <a href="libri/${b.id}.html">Apri &rarr;</a>
          <span class="meta">${b.spreads} aperture &middot; ${b.kinds.map(k => KIND[k]).join(' &middot; ')}</span></figcaption>
      </figure>`).join('');
const chips = books.map((b, i) => `<button type="button" class="chip" data-hero="${b.id}" aria-pressed="${i === 0}">${esc(b.title)}</button>`).join('');

const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pop-up di carta</title>
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<meta name="description" content="Libri pop-up di carta in un solo file HTML, da una richiesta di una riga: otto città da sfogliare, con linguette, sportelli e ruote.">
<style>
${css}
:root { --ink: #2B2622; --ink-2: #5A524A; --paper: #F4EEE1; --cream: #EADFC8; --line: rgba(43, 38, 34, 0.14); --accent: #C8643B; }
* { box-sizing: border-box; }
html, body { margin: 0; }
body {
  color: var(--ink); font: 400 16px/1.6 "PopupText", system-ui, sans-serif; background-color: #F1EADB;
  background-image:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .32 0 0 0 0 .27 0 0 0 0 .2 0 0 0 .14 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E"),
    radial-gradient(ellipse at 50% 0%, rgba(255, 252, 244, 0.8), rgba(222, 211, 189, 0.4) 80%);
  background-attachment: fixed;
}
a { color: inherit; }
.wrap { max-width: 1080px; margin: 0 auto; padding: 0 24px; }
.display { font-family: "PopupDisplay", "Arial Narrow", sans-serif; font-weight: 400; letter-spacing: 0.02em; line-height: 0.95; margin: 0; }
.eyebrow { font-size: 12px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink-2); margin: 0; }

header.bar { position: sticky; top: 0; z-index: 10; backdrop-filter: blur(8px); background: rgba(241, 234, 219, 0.82); border-bottom: 1px solid var(--line); }
header.bar .wrap { display: flex; align-items: center; justify-content: space-between; height: 56px; gap: 16px; }
.logo { display: flex; align-items: center; gap: 10px; font: 400 22px/1 "PopupDisplay", sans-serif; letter-spacing: 0.06em; text-decoration: none; white-space: nowrap; }
.logo svg { width: 26px; height: 26px; }
.live { white-space: nowrap; font-size: 12px; font-weight: 600; letter-spacing: 0.06em; padding: 5px 10px; border: 1px solid var(--line); border-radius: 999px; display: inline-flex; gap: 6px; align-items: center; }
.live::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
.byline { font-size: 13px; color: var(--ink-2); text-decoration: none; }

.hero { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 48px; align-items: center; padding: 64px 0 72px; }
.hero h1 { font-size: clamp(48px, 6.4vw, 80px); }
.hero h1 em { font-style: normal; color: var(--accent); }
.hero p.lead { font-size: 18px; color: var(--ink-2); max-width: 34ch; margin: 22px 0 26px; }
.prompt { display: flex; align-items: center; gap: 10px; background: var(--paper); border: 1px solid var(--line); border-radius: 10px; padding: 10px 10px 10px 16px; font: 500 14px/1.4 ui-monospace, "SF Mono", Menlo, monospace; }
.prompt code { flex: 1; min-width: 0; overflow-x: auto; white-space: nowrap; }
.prompt button, .btn { font: 600 13px/1 "PopupText", sans-serif; letter-spacing: 0.04em; border: 1px solid var(--ink); background: var(--ink); color: var(--paper); border-radius: 7px; padding: 9px 12px; cursor: pointer; }
.note { font-size: 13px; color: var(--ink-2); margin-top: 12px; }
.note a, .side a { color: var(--ink); text-underline-offset: 3px; }
.gh { font-size: 13px; font-weight: 600; text-decoration: none; padding: 6px 11px; border: 1px solid var(--ink); border-radius: 7px; }
.gh:hover { background: var(--ink); color: var(--paper); }
.tabs { display: flex; gap: 6px; margin-bottom: 16px; }
.tab { font: 600 13px/1 "PopupText", sans-serif; letter-spacing: 0.04em; padding: 9px 13px; border-radius: 7px; border: 1px solid var(--line); background: transparent; color: var(--ink); cursor: pointer; }
.tab[aria-selected="true"] { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.steps[hidden] { display: none; }
#installa .steps { grid-template-columns: minmax(0, 1fr); gap: 10px; }
#installa .steps li { display: grid; grid-template-columns: 44px minmax(0, 1fr); column-gap: 8px; }
#installa .steps li::before { grid-row: span 3; margin: 0; }
.steps .prompt { margin-top: 12px; font-size: 12.5px; }
.steps p + p { margin-top: 8px; }
.steps code, .faq code, .side code { font: 500 12.5px/1.4 ui-monospace, "SF Mono", Menlo, monospace; background: rgba(43, 38, 34, 0.07); padding: 1px 5px; border-radius: 4px; }
.req { font-size: 14px; color: var(--ink-2); margin: 0; }
.safe { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.safe div { border-top: 2px solid var(--ink); padding-top: 12px; }
.safe b { display: block; margin-bottom: 4px; }
.safe p { margin: 0; font-size: 14.5px; color: var(--ink-2); }
.faq details { border-bottom: 1px solid var(--line); padding: 14px 0; }
.faq details:first-child { border-top: 1px solid var(--line); }
.faq summary { cursor: pointer; font-weight: 600; list-style: none; display: flex; justify-content: space-between; gap: 12px; }
.faq summary::after { content: "+"; font-weight: 400; color: var(--ink-2); }
.faq details[open] summary::after { content: "\\2212"; }
.faq p { margin: 8px 0 0; font-size: 14.5px; color: var(--ink-2); max-width: 62ch; }
.panel { background: rgba(234, 223, 200, 0.55); border: 1px solid var(--line); border-radius: 16px; padding: 12px; box-shadow: 0 1px 0 rgba(255, 255, 255, 0.6) inset, 0 18px 40px -24px rgba(43, 38, 34, 0.35); }
.hero-stage { aspect-ratio: 16 / 11; }
.chips { display: flex; gap: 6px; padding: 12px 4px 2px; overflow-x: auto; scroll-snap-type: x proximity; scrollbar-width: none; -webkit-mask-image: linear-gradient(90deg, #000 calc(100% - 32px), transparent); mask-image: linear-gradient(90deg, #000 calc(100% - 32px), transparent); }
.chips::-webkit-scrollbar { display: none; }
.chip { flex: 0 0 auto; white-space: nowrap; scroll-snap-align: start; font: 600 11.5px/1 "PopupText", sans-serif; letter-spacing: 0.06em; text-transform: uppercase; padding: 9px 12px; border-radius: 999px; border: 1px solid var(--line); background: transparent; color: var(--ink); cursor: pointer; }
.chip:last-child { margin-right: 24px; }
@media (min-width: 861px) {
  .chips { overflow: visible; -webkit-mask-image: none; mask-image: none; }
  .chip { flex: 1 1 0; min-width: 0; padding: 9px 4px; font-size: 11px; letter-spacing: 0.04em; text-align: center; }
  .chip:last-child { margin-right: 0; }
}
.chip[aria-pressed="true"] { background: var(--ink); color: var(--paper); border-color: var(--ink); }

.band { border-top: 1px solid var(--line); padding: 72px 0; }
.band .wrap { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 48px; }
.band h2 { font-size: 44px; margin-bottom: 14px; }
.band .side p { color: var(--ink-2); font-size: 15px; margin: 0; }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 32px 24px; }
.card { margin: 0; }
.card .stage { background: rgba(234, 223, 200, 0.55); border: 1px solid var(--line); border-radius: 14px; padding: 6px; aspect-ratio: 16 / 11; }
.card .stage .popup-book { height: 100%; }
.card .popup-hint, .card .popup-ui { display: none; }
.card figcaption { font-size: 14.5px; margin-top: 12px; }
.card .ask { color: var(--ink); }
.card a { font-weight: 600; color: var(--ink-2); text-decoration: none; white-space: nowrap; }
.card a:hover { color: var(--accent); }
.card .meta { display: block; margin-top: 4px; font-size: 11.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-2); opacity: 0.8; }

.steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin: 0 0 28px; padding: 0; list-style: none; counter-reset: s; }
.steps li { background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 18px; counter-increment: s; }
.steps li::before { content: counter(s); display: block; font: 400 34px/1 "PopupDisplay", sans-serif; color: var(--accent); margin-bottom: 8px; }
.steps b { display: block; margin-bottom: 4px; }
.steps p { margin: 0; font-size: 14.5px; color: var(--ink-2); }
.tries { display: flex; flex-wrap: wrap; gap: 8px; }
.try { font-size: 14px; background: transparent; border: 1px dashed rgba(43, 38, 34, 0.35); border-radius: 8px; padding: 8px 12px; color: var(--ink); cursor: pointer; text-align: left; }
.try:hover { border-style: solid; }
.mech { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
.mech div { background: #F1EADB; padding: 18px; }
.mech b { font: 400 24px/1 "PopupDisplay", sans-serif; letter-spacing: 0.04em; display: block; margin-bottom: 6px; }
.mech p { margin: 0; font-size: 14px; color: var(--ink-2); }
footer { border-top: 1px solid var(--line); padding: 28px 0 40px; font-size: 13px; color: var(--ink-2); }
footer .wrap { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); background: var(--ink); color: var(--paper); padding: 10px 16px; border-radius: 8px; font-size: 14px; opacity: 0; transition: opacity .2s; pointer-events: none; }
.toast.on { opacity: 1; }

@media (max-width: 860px) {
  .hero { grid-template-columns: minmax(0, 1fr); gap: 32px; padding: 40px 0 48px; }
  .band { padding: 48px 0; }
  .band .wrap { grid-template-columns: minmax(0, 1fr); gap: 20px; }
  .grid { grid-template-columns: minmax(0, 1fr); }
  .steps, .mech, .safe { grid-template-columns: minmax(0, 1fr); }
  .byline { display: none; }
}
@media (max-width: 600px) { .wrap { padding: 0 16px; } .card .stage { aspect-ratio: 1 / 1; } }
@media (max-width: 420px) { .live { display: none; } }
</style>
</head>
<body>
<header class="bar"><div class="wrap">
  <a class="logo" href="#top"><svg viewBox="0 0 26 26" aria-hidden="true"><path d="M2 20 L13 15 L24 20" fill="none" stroke="#2B2622" stroke-width="1.6"/><path d="M8 17.3 V9 H13 V15" fill="#C8643B"/><path d="M13 15 V5 L18 8 V17.3" fill="#2B2622"/></svg>Pop-up di carta</a>
  <span class="live">${books.length} libri da sfogliare</span>
  <a class="gh" href="https://github.com/${REPO}">GitHub</a>
</div></header>

<main id="top">
  <section class="wrap hero">
    <div>
      <h1 class="display">Da una riga<br>a un libro<br>che <em>si apre</em>.</h1>
      <p class="lead">Scrivi cosa deve alzarsi dalla pagina. Ricevi un file HTML con un libro pop-up di carta in tre aperture, e in ognuna una linguetta da tirare, uno sportello da alzare o una ruota da girare.</p>
      <div class="prompt"><code id="cmd">${CLONE}</code><button type="button" data-copy="#cmd">Copia</button></div>
      <p class="note">Una skill gratuita per Claude Code. <a href="#installa">Come installarla</a> &middot; <a href="#sicuro">Cosa c'è dentro</a></p>
      <p class="note">Funziona per luoghi e storie: città, borghi, hotel, eventi. Non per oggetti con un interno da spiegare, come un motore: lì il pop-up non mostra niente.</p>
    </div>
    <div class="panel">
      <div class="stage hero-stage" id="hero"></div>
      <div class="chips" role="group" aria-label="Scegli la città">${chips}</div>
    </div>
  </section>

  <section class="band" id="esempi"><div class="wrap">
    <div class="side"><h2 class="display">Esempi</h2><p>Ogni libro viene dalla richiesta scritta sotto, sullo stesso motore: cambia solo la descrizione della scena. Qui si sfogliano da soli; a tutta pagina si tirano le linguette, si alzano gli sportelli e si girano le ruote.</p></div>
    <div class="grid">${cards}
    </div>
  </div></section>

  <section class="band" id="tua-citta"><div class="wrap">
    <div class="side"><h2 class="display">La tua città</h2><p>Le otto città sono esempi. Per un altro luogo si cambia la descrizione, non il codice.</p></div>
    <div>
      <ol class="steps">
        <li><b>Descrivi il luogo</b><p>Cosa si alza dalla pagina e cosa si può toccare. Due righe bastano.</p></li>
        <li><b>Il controllo delle pieghe</b><p>Prima della consegna un validatore apre e chiude il libro e prova ogni piega come su carta vera. Se un pezzo sporge o ne urta un altro, dice quale e di quanti millimetri.</p></li>
        <li><b>Un solo file</b><p>Un HTML tra 160 e 270 KB, senza dipendenze: si apre nel browser o si incolla in una pagina del sito.</p></li>
      </ol>
      <p class="eyebrow" style="margin-bottom:10px">Richieste di esempio · un clic le copia</p>
      <div class="tries">
        <button type="button" class="try">un libro pop-up di Napoli, con il Vesuvio e il golfo</button>
        <button type="button" class="try">Lisbona in tre aperture, con un tram da far salire</button>
        <button type="button" class="try">New York: lo skyline che si accende di notte</button>
        <button type="button" class="try">il nostro borgo, dalla piazza alla chiesa in cima</button>
        <button type="button" class="try">l'hotel sul lago, con le camere sotto gli sportelli</button>
        <button type="button" class="try">il festival raccontato come un libro che si apre</button>
      </div>
    </div>
  </div></section>

  <section class="band" id="meccanismi"><div class="wrap">
    <div class="side"><h2 class="display">Cosa si muove</h2><p>Sei meccanismi presi dai libri pop-up veri. Ogni pezzo è incollato e piegato come in carta: nessuno galleggia.</p></div>
    <div class="mech">
      <div><b>Facciate</b><p>Una piega parallela alla costola: palazzi, ponti, file di case.</p></div>
      <div><b>Gradoni</b><p>Pieghe annidate che scendono verso chi legge: terrazze, scalinate.</p></div>
      <div><b>Torri</b><p>Una piega a V sulla costola: campanili, fari, la Mole.</p></div>
      <div><b>Linguetta</b><p>Si tira dal bordo e qualcosa attraversa la pagina: una nave, un bus, un treno.</p></div>
      <div><b>Sportello</b><p>Si alza e mostra cosa c'è sotto o dentro: un cortile, la metro, un caffè.</p></div>
      <div><b>Ruota</b><p>Si gira e cambia la scena: l'ora, la stagione, il giorno e la notte.</p></div>
    </div>
  </div></section>

  <section class="band" id="installa"><div class="wrap">
    <div class="side"><h2 class="display">Installa</h2><p>Tre passi, un paio di minuti. Servono Claude Code e Node.js: <code>node -v</code> nel Terminale ti dice se c'è.</p></div>
    <div>
      <div class="tabs" role="tablist">
        <button type="button" class="tab" role="tab" aria-selected="true" data-tab="git">Claude Code</button>
        <button type="button" class="tab" role="tab" aria-selected="false" data-tab="zip">Download .zip</button>
      </div>
      <ol class="steps" data-panel="git">
        <li><b>Installa</b><p>Apri il Terminale (su Mac: &#8984; Spazio, scrivi Terminale), incolla questa riga e premi Invio.</p><div class="prompt"><code id="cmd-git">${CLONE}</code><button type="button" data-copy="#cmd-git">Copia</button></div></li>
        <li><b>Riavvia Claude Code</b><p>Chiudilo e riaprilo: legge le skill all'avvio.</p></li>
        <li><b>Chiedi un libro</b><p>Descrivi il luogo a parole, oppure comincia con <code>/popup-carta</code>. Claude salva un file .html nella cartella in cui lavori: aprilo con un doppio clic.</p></li>
      </ol>
      <ol class="steps" data-panel="zip" hidden>
        <li><b>Scarica</b><p><a href="https://github.com/${REPO}/archive/refs/heads/main.zip">paperjoy-main.zip</a> da GitHub.</p></li>
        <li><b>Apri lo zip</b><p>Doppio clic nella cartella Download: esce la cartella paperjoy-main. Leggi pure SKILL.md: sono le istruzioni che segue Claude.</p></li>
        <li><b>Spostala tra le skill</b><p>Nel Terminale incolla questa riga, poi riavvia Claude Code.</p><div class="prompt"><code id="cmd-zip">mkdir -p ~/.claude/skills &amp;&amp; mv ~/Downloads/paperjoy-main ~/.claude/skills/popup-carta</code><button type="button" data-copy="#cmd-zip">Copia</button></div></li>
      </ol>
    </div>
  </div></section>

  <section class="band" id="sicuro"><div class="wrap">
    <div class="side"><h2 class="display">È sicuro?</h2><p>Puoi leggere ogni file prima di installarlo. <a href="https://github.com/${REPO}">Il codice è su GitHub</a>.</p></div>
    <div class="safe">
      <div><b>Testo in chiaro</b><p>Le istruzioni per Claude, il motore in JavaScript, lo schema della scena, i libri d'esempio e due font. Nessun file eseguibile già compilato.</p></div>
      <div><b>All'installazione non parte niente</b><p>Si copiano dei file in una cartella. Nessuno script, nessun pacchetto da scaricare, nessuna dipendenza.</p></div>
      <div><b>Il libro resta nel browser</b><p>Ogni libro è un file HTML con motore e font dentro. Non fa richieste esterne, non traccia e non chiede account.</p></div>
    </div>
  </div></section>

  <section class="band" id="domande"><div class="wrap">
    <div class="side"><h2 class="display">Domande</h2></div>
    <div class="faq">
      <details><summary>Cos'è una skill?</summary><p>Una cartella di istruzioni e file che Claude legge quando il compito la riguarda. Questa gli insegna a scrivere la scena del libro in un JSON e a farla controllare dal motore prima di consegnarla.</p></details>
      <details><summary>Claude non la usa</summary><p>Controlla che esista <code>~/.claude/skills/popup-carta/SKILL.md</code> e riavvia Claude Code. Puoi anche chiamarla per nome con <code>/popup-carta</code>.</p></details>
      <details><summary>Funziona su claude.ai?</summary><p>Non l'ho provata lì. Il controllo delle pieghe gira con Node.js, quindi l'ambiente sicuro è Claude Code sul tuo computer.</p></details>
      <details><summary>Posso metterlo in una pagina del mio sito?</summary><p>Sì. Chiedi il libro «da incollare in una pagina»: invece del file intero ricevi il blocco con stile, libro e script, che prende la larghezza del contenitore.</p></details>
      <details><summary>Come la aggiorno o la tolgo?</summary><p>Per aggiornarla: <code>git -C ~/.claude/skills/popup-carta pull</code>. Per toglierla basta cancellare la cartella <code>~/.claude/skills/popup-carta</code>.</p></details>
      <details><summary>Posso usarla per lavori commerciali?</summary><p>Sì. Il codice ha licenza MIT; i font Bebas Neue e DM Sans hanno licenza SIL Open Font License. I libri che crei sono tuoi.</p></details>
    </div>
  </div></section>
</main>

<footer><div class="wrap"><span>Pop-up di carta &middot; un file HTML per libro, nessuna dipendenza &middot; <a href="https://github.com/${REPO}">GitHub</a></span><span>Paolo Bortolotti</span></div></footer>
<div class="toast" id="toast" role="status"></div>

<script type="application/json" id="scenes">${scenes}</script>
<script>
${engine}
</script>
<script>
(() => {
  const SCENES = JSON.parse(document.getElementById('scenes').textContent);
  const MAX_LIVE = 4, OPEN_AFTER = 900, PAGE_MS = 4200, BACK_MS = 1800;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const live = new Map();

  function release(el) {
    const s = live.get(el); if (!s) return;
    clearTimeout(s.timer); clearTimeout(s.idle);
    const cv = el.querySelector('canvas');
    try { cv && cv.addEventListener('webglcontextlost', e => e.stopImmediatePropagation(), true); cv && cv.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext(); } catch (e) { console.warn('popup-site', e); }
    s.api && s.api.destroy();
    live.delete(el);
  }
  function autoplay(el) {
    const s = live.get(el); if (!s || reduce) return;
    clearTimeout(s.timer);
    const api = s.api;
    const step = () => {
      if (!live.has(el) || s.manual || !s.visible) return;
      const n = SCENES[el.dataset.book].spreads.length;
      if (s.back) { api.prev(); if (api.spread === 0) { s.back = false; s.timer = setTimeout(step, PAGE_MS); } else s.timer = setTimeout(step, BACK_MS); return; }
      if (api.spread < n) { api.next(); s.timer = setTimeout(step, api.spread === 1 ? PAGE_MS + 600 : PAGE_MS); }
      else { s.back = true; s.timer = setTimeout(step, PAGE_MS); }
    };
    s.timer = setTimeout(step, api.spread === 0 ? OPEN_AFTER : PAGE_MS);
  }
  function mount(el) {
    if (live.has(el)) return;
    if (live.size >= MAX_LIVE) {
      const victim = [...live.entries()].filter(([e, s]) => !s.visible && e !== el && !e.classList.contains('hero-stage')).sort((a, b) => a[1].seen - b[1].seen)[0];
      if (victim) release(victim[0]);
    }
    const api = Popup.mount(el, SCENES[el.dataset.book]);
    if (!api) return;
    const s = { api, timer: 0, seen: performance.now(), visible: true, manual: false, back: false };
    live.set(el, s);
    const stop = () => { s.manual = true; clearTimeout(s.timer); clearTimeout(s.idle); s.idle = setTimeout(() => { s.manual = false; if (s.visible) autoplay(el); }, 12000); };
    el.addEventListener('pointerdown', stop);
    el.addEventListener('keydown', stop);
    autoplay(el);
  }

  const queue = [];
  let pumping = false;
  const idle = window.requestIdleCallback || (fn => setTimeout(fn, 60));
  function pump() {
    if (pumping) return; pumping = true;
    idle(() => { pumping = false; const el = queue.shift(); if (el) { const s = live.get(el); if (!s && el._vis) mount(el); if (queue.length) pump(); } });
  }
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      const el = e.target; el._vis = e.isIntersecting;
      const s = live.get(el);
      if (s && !e.isIntersecting) release(el);
      else if (s) { s.visible = true; s.seen = performance.now(); if (!s.manual) autoplay(el); }
      else if (e.isIntersecting) { queue.push(el); pump(); }
    }
  }, { rootMargin: '200px 0px' });

  const hero = document.getElementById('hero');
  function setHero(id) {
    release(hero);
    hero.dataset.book = id;
    mount(hero);
    for (const c of document.querySelectorAll('[data-hero]')) { const on = c.dataset.hero === id; c.setAttribute('aria-pressed', String(on)); if (on) requestAnimationFrame(() => { const row = c.parentElement; row.scrollTo({ left: row.scrollLeft + c.getBoundingClientRect().left - row.getBoundingClientRect().left - 8 }); }); }
  }
  document.querySelectorAll('[data-hero]').forEach(c => c.addEventListener('click', () => setHero(c.dataset.hero)));
  hero.dataset.book = Object.keys(SCENES)[0];
  io.observe(hero);
  document.querySelectorAll('.card .stage').forEach(el => io.observe(el));

  const toast = document.getElementById('toast');
  const say = t => { toast.textContent = t; toast.classList.add('on'); setTimeout(() => toast.classList.remove('on'), 1600); };
  const copy = t => navigator.clipboard ? navigator.clipboard.writeText(t).then(() => say('Copiato'), () => say(t)) : say(t);
  document.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => copy(document.querySelector(b.dataset.copy).textContent)));
  document.querySelectorAll('.try').forEach(b => b.addEventListener('click', () => copy(b.textContent)));
  document.querySelectorAll('[data-tab]').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('[data-tab]').forEach(o => o.setAttribute('aria-selected', String(o === t)));
    document.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== t.dataset.tab; });
  }));
})();
</script>
</body>
</html>
`;
writeFileSync(join(site, 'index.html'), html);
console.log(JSON.stringify({ ok: true, out: 'docs/index.html', books: books.map(b => b.id), kb: +(Buffer.byteLength(html) / 1024).toFixed(1) }));
