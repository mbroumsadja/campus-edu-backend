// src/docs/renderDocs.js
// Page de documentation de l'API, générée côté serveur depuis le contrat OpenAPI (src/docs/openapi.js).
// Aucune ressource externe : le HTML, le CSS (/docs/style.css) et le script (/docs/app.js) viennent de l'API elle-même,
// donc une politique CSP stricte suffit et la page marche même sans accès à un CDN.
// Sans JavaScript la page reste lisible (sections repliables natives) ; le script ajoute le filtre et la copie des exemples.

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = (v) => esc(v).replace(/`([^`]+)`/g, '<code>$1</code>');
const slug = (v) => String(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ── Schémas : résolution des $ref et mise à plat en lignes « champ / type / description » ──
const resolve = (spec, schema) => {
  if (!schema) return {};
  if (schema.$ref) {
    const name = schema.$ref.split('/').pop();
    return { ...resolve(spec, spec.components.schemas[name]), __name: name };
  }
  if (schema.allOf) {
    return schema.allOf.map((s) => resolve(spec, s)).reduce((acc, s) => ({
      ...acc, ...s, properties: { ...acc.properties, ...s.properties }, required: [...(acc.required || []), ...(s.required || [])],
    }), { ...schema, allOf: undefined });
  }
  return schema;
};

const typeLabel = (spec, schema) => {
  const s = resolve(spec, schema);
  if (s.enum) return s.enum.map((e) => `"${e}"`).join(' | ');
  if (s.type === 'array') return `liste de ${typeLabel(spec, s.items)}`;
  if (s.__name && s.type === 'object') return `objet ${s.__name}`;
  if (s.type === 'integer' && s.format === 'int64') return 'entier (64 bits)';
  if (s.type === 'integer') return 'entier';
  if (s.type === 'string' && s.format) return `texte (${s.format})`;
  if (s.type === 'string') return 'texte';
  if (s.type === 'boolean') return 'booléen';
  if (s.type === 'number') return 'nombre';
  return s.type || 'objet';
};

const flatten = (spec, schema, prefix = '', depth = 0, seen = new Set(), parentRequired = true) => {
  const s = resolve(spec, schema);
  const rows = [];
  if (s.type === 'array' && prefix === '') return flatten(spec, s.items, '[]', depth, seen, parentRequired);
  if (!s.properties) return rows;
  const required = new Set(s.required || []);
  for (const [name, raw] of Object.entries(s.properties)) {
    const p = resolve(spec, raw);
    const path = prefix ? `${prefix}${prefix.endsWith(']') ? '.' : '.'}${name}` : name;
    rows.push({
      name: path.replace(/^\./, ''),
      type: typeLabel(spec, raw),
      required: required.has(name) && parentRequired,
      desc: [p.description || raw.description, p.nullable ? 'peut être vide' : null, p.deprecated ? 'déprécié' : null].filter(Boolean).join(' — '),
      deprecated: !!p.deprecated,
      example: p.example,
    });
    const nested = p.type === 'array' ? resolve(spec, p.items) : p;
    const key = raw.$ref || (p.items && p.items.$ref);
    if (depth < 2 && nested.properties && !(key && seen.has(key))) {
      const next = new Set(seen); if (key) next.add(key);
      rows.push(...flatten(spec, nested, p.type === 'array' ? `${path}[]` : path, depth + 1, next, parentRequired && required.has(name)));
    }
  }
  return rows;
};

// Exemple de valeur pour les requêtes curl
const sample = (spec, schema, depth = 0) => {
  const s = resolve(spec, schema);
  if (s.example !== undefined) return s.example;
  if (s.enum) return s.enum[0];
  if (s.type === 'array') return [sample(spec, s.items, depth + 1)];
  if (s.type === 'integer') return 1;
  if (s.type === 'number') return 1;
  if (s.type === 'boolean') return true;
  if (s.type === 'string') return s.format === 'uri' ? 'https://abc123.public.blob.vercel-storage.com/fichier.pdf' : (s.pattern === '^\\d{4}-\\d{4}$' ? '2024-2025' : 'texte');
  if (s.properties && depth < 3) {
    return Object.fromEntries(Object.entries(s.properties).filter(([, v]) => !resolve(spec, v).deprecated)
      .map(([k, v]) => [k, sample(spec, v, depth + 1)]));
  }
  return {};
};

const jsonSchemaOf = (content) => content && content['application/json'] && content['application/json'].schema;

// Dans les réponses, on documente le contenu de `data`
const dataSchema = (spec, schema) => {
  const s = resolve(spec, schema);
  return s.properties && s.properties.data ? s.properties.data : null;
};

const curlFor = (spec, baseUrl, method, path, op, pathParams) => {
  let url = path.replace(/\{(\w+)\}/g, (_m, n) => {
    const p = pathParams.find((x) => x.name === n);
    return esc(resolve(spec, p && p.schema).example ?? 1);
  });
  const query = (op.parameters || []).filter((p) => p.in === 'query' && p.required)
    .map((p) => `${p.name}=${p.schema.enum ? p.schema.enum[0] : 1}`);
  if (query.length) url += `?${query.join('&')}`;
  const lines = [`curl${method === 'get' ? '' : ` -X ${method.toUpperCase()}`} "${baseUrl}${url}"`];
  if (op.security) lines.push('  -H "Authorization: Bearer $TOKEN"');
  const body = op.requestBody && jsonSchemaOf(op.requestBody.content);
  if (body) {
    lines.push('  -H "Content-Type: application/json"');
    lines.push(`  -d '${JSON.stringify(sample(spec, body))}'`);
  }
  return lines.join(' \\\n');
};

// ── Fragments HTML ──
const table = (head, rows) => `<div class="tw"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;

const fieldsTable = (rows) => table(['Champ', 'Type', 'Description'], rows.map((r) =>
  `<tr${r.deprecated ? ' class="dep"' : ''}><td><code>${esc(r.name)}</code>${r.required ? '<span class="req" title="obligatoire">obligatoire</span>' : ''}</td>`
  + `<td>${esc(r.type)}</td><td>${md(r.desc)}</td></tr>`));

const renderOperation = (spec, baseUrl, method, path, op, pathParams) => {
  const id = `${method}-${slug(path)}`;
  const params = [...pathParams, ...(op.parameters || [])].filter((p) => p.name !== 'X-App-Version');
  const body = op.requestBody && jsonSchemaOf(op.requestBody.content);
  const bodyRows = body ? flatten(spec, body) : [];
  const responses = Object.entries(op.responses || {});

  const paramsHtml = params.length ? `<h4>Paramètres</h4>${table(['Nom', 'Où', 'Type', 'Description'], params.map((p) =>
    `<tr><td><code>${esc(p.name)}</code>${p.required ? '<span class="req">obligatoire</span>' : ''}</td><td>${p.in === 'path' ? 'chemin' : p.in === 'query' ? 'requête' : 'en-tête'}</td>`
    + `<td>${esc(typeLabel(spec, p.schema))}${p.schema.default !== undefined ? ` (défaut ${esc(p.schema.default)})` : ''}${p.schema.maximum ? ` (max ${esc(p.schema.maximum)})` : ''}</td><td>${md(p.description || '')}</td></tr>`))}` : '';

  const bodyHtml = body ? `<h4>Corps de la requête <small>JSON</small></h4>${bodyRows.length ? fieldsTable(bodyRows) : '<p class="muted">Corps libre.</p>'}` : '';

  const respHtml = `<h4>Réponses</h4>${responses.map(([code, r]) => {
    const ds = r.content && dataSchema(spec, jsonSchemaOf(r.content));
    const rows = ds ? flatten(spec, ds) : [];
    const paged = jsonSchemaOf(r.content) && resolve(spec, jsonSchemaOf(r.content)).properties?.pagination;
    return `<div class="resp"><div class="rhead"><span class="code c${String(code)[0]}">${esc(code)}</span><span>${esc(r.description)}</span>${paged ? '<span class="tag">paginée</span>' : ''}</div>`
      + `${rows.length ? `<details class="fields"><summary>Champs de <code>data</code>${ds && resolve(spec, ds).type === 'array' ? ' (liste)' : ''}</summary>${fieldsTable(rows)}</details>` : ''}</div>`;
  }).join('')}`;

  const curl = curlFor(spec, baseUrl, method, path, op, pathParams);
  const pathHtml = esc(path).replace(/\{(\w+)\}/g, '<i>{$1}</i>');

  return `<details class="op" id="${id}" data-search="${esc(`${method} ${path} ${op.summary || ''} ${op.description || ''}`.toLowerCase())}">`
    + `<summary><span class="m ${method}">${method.toUpperCase()}</span><code class="p">${pathHtml}</code>`
    + `<span class="s">${esc(op.summary || '')}</span>${op.security ? '<span class="lock" title="Jeton d\'accès requis">🔒 jeton</span>' : '<span class="pub">public</span>'}</summary>`
    + `<div class="body">${op.description ? `<p>${md(op.description)}</p>` : ''}${paramsHtml}${bodyHtml}${respHtml}`
    + `<h4>Exemple</h4><div class="code-wrap"><pre><code>${esc(curl)}</code></pre><button type="button" class="copy" aria-label="Copier l'exemple">Copier</button></div></div></details>`;
};

const intro = (spec) => {
  const lines = String(spec.info.description || '').split('\n').filter(Boolean);
  const items = lines.filter((l) => l.startsWith('- ')).map((l) => `<li>${esc(l.slice(2)).replace(/`([^`]+)`/g, '<code>$1</code>')}</li>`);
  const lead = lines.filter((l) => !l.startsWith('- ')).map((l) => `<p>${esc(l).replace(/`([^`]+)`/g, '<code>$1</code>')}</p>`);
  return `${lead.join('')}<ul>${items.join('')}</ul>`;
};

const renderPage = (spec, { baseUrl = '/api/v1', origin = '' } = {}) => {
  const curlBase = `${origin}${baseUrl}`;
  const tags = spec.tags.map((t) => t.name);
  const byTag = Object.fromEntries(tags.map((t) => [t, []]));
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const m of METHODS) {
      if (item[m]) byTag[item[m].tags[0]].push({ method: m, path, op: item[m], pathParams: item.parameters || [] });
    }
  }
  const total = Object.values(byTag).reduce((n, l) => n + l.length, 0);

  const nav = tags.filter((t) => byTag[t].length).map((t) =>
    `<li><a href="#${slug(t)}" data-sec="${slug(t)}">${esc(t)}<span>${byTag[t].length}</span></a></li>`).join('');

  const sections = tags.filter((t) => byTag[t].length).map((t) =>
    `<section id="${slug(t)}" class="sec"><h2>${esc(t)}</h2>${byTag[t].map((e) => renderOperation(spec, curlBase, e.method, e.path, e.op, e.pathParams)).join('')}</section>`).join('');

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Campus Edu API — Documentation</title>
<meta name="description" content="Documentation de l'API Campus Edu : ${total} endpoints, authentification, pagination, erreurs.">
<link rel="stylesheet" href="${esc(baseUrl)}/docs/style.css">
</head>
<body>
<header class="top">
  <div class="brand"><strong>Campus Edu</strong> API <span class="ver">v${esc(spec.info.version)}</span></div>
  <div class="links"><a href="${esc(baseUrl)}/openapi.json">openapi.json</a><a href="${esc(baseUrl)}/docs/swagger">Tester (Swagger)</a></div>
</header>
<div class="layout">
  <nav class="side" aria-label="Sections">
    <label class="sr" for="q">Filtrer les endpoints</label>
    <input id="q" type="search" placeholder="Filtrer : sujets, POST, login…" autocomplete="off">
    <ul>${nav}</ul>
    <p class="count"><span id="shown">${total}</span> / ${total} endpoints</p>
    <div class="acts"><button type="button" id="expand">Tout déplier</button><button type="button" id="collapse">Tout replier</button></div>
  </nav>
  <main>
    <section class="hero">
      <h1>Documentation de l'API</h1>
      <div class="kv"><span>URL de base</span><code>${esc(curlBase)}</code></div>
      ${intro(spec)}
    </section>
    <section class="hero" id="demarrage">
      <h2>Démarrage rapide</h2>
      <ol class="steps">
        <li><strong>Se connecter</strong> : <code>POST /auth/login</code> avec <code>{ "matricule", "password" }</code> renvoie <code>accessToken</code> et <code>refreshToken</code>.</li>
        <li><strong>Appeler l'API</strong> : ajouter l'en-tête <code>Authorization: Bearer &lt;accessToken&gt;</code> aux endpoints marqués « jeton ».</li>
        <li><strong>Renouveler</strong> : à l'expiration (401), <code>POST /auth/refresh</code> avec le <code>refreshToken</code>.</li>
      </ol>
      <div class="tw"><table><thead><tr><th>Code</th><th>Signification</th></tr></thead><tbody>
        <tr><td><span class="code c2">2xx</span></td><td>Succès : <code>{ "success": true, "data": … }</code></td></tr>
        <tr><td><span class="code c4">400</span></td><td>Données invalides : <code>errors</code> liste chaque champ en cause</td></tr>
        <tr><td><span class="code c4">401 / 403</span></td><td>Non connecté / droits insuffisants</td></tr>
        <tr><td><span class="code c4">409</span></td><td>Conflit : doublon, ou ressource encore utilisée</td></tr>
        <tr><td><span class="code c4">426</span></td><td>Version de l'application trop ancienne (<code>code: "APP_UPDATE_REQUIRED"</code>)</td></tr>
        <tr><td><span class="code c4">429</span></td><td>Trop de requêtes : réessayer plus tard</td></tr>
      </tbody></table></div>
    </section>
    <p id="none" class="muted" hidden>Aucun endpoint ne correspond à ce filtre.</p>
    ${sections}
    <footer>Généré depuis <a href="${esc(baseUrl)}/openapi.json">le contrat OpenAPI</a> : cette page est toujours à jour avec les routes.</footer>
  </main>
</div>
<script src="${esc(baseUrl)}/docs/app.js"></script>
</body>
</html>`;
};

// ── Feuille de style (servie sur /docs/style.css) ──
const CSS = `
:root{--bg:#f6f8fa;--surface:#fff;--ink:#16202a;--muted:#5b6b7b;--line:#dde3ea;--accent:#1f4e79;--accent-ink:#fff;--teal:#146c66;--code-bg:#eef2f6;
--get:#0b6b8a;--post:#16794a;--put:#8a5a00;--patch:#6b3fa0;--delete:#b3261e;--get-bg:#e3f3f8;--post-bg:#e1f4ea;--put-bg:#fcf0d6;--patch-bg:#efe6f8;--delete-bg:#fbe5e3;--focus:#1f6fb2;--head-bg:#1f4e79;--head-ink:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#0e1419;--surface:#151d25;--ink:#e6edf3;--muted:#93a4b5;--line:#27323d;--accent:#7db3e6;--accent-ink:#0e1419;--teal:#5cc7bd;--code-bg:#1b2530;
--get:#6cc4e0;--post:#6fd3a0;--put:#f0c15c;--patch:#c7a3ee;--delete:#f2928b;--get-bg:#12303a;--post-bg:#12301f;--put-bg:#33280d;--patch-bg:#271c38;--delete-bg:#3a1714;--focus:#7db3e6;--head-bg:#101820;--head-ink:#e6edf3}}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:72px}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.88em}
code{background:var(--code-bg);padding:.1em .35em;border-radius:4px}
a{color:var(--accent)}a:focus-visible,button:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.top{position:sticky;top:0;z-index:5;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px 16px;padding:12px 20px;background:var(--head-bg);color:var(--head-ink);border-bottom:1px solid var(--line)}
.top a{color:var(--head-ink);margin-left:16px;font-size:.92rem;white-space:nowrap}.links{display:flex;flex-wrap:wrap}.ver{opacity:.8;font-size:.85rem;margin-left:6px}
.layout{display:grid;grid-template-columns:250px minmax(0,1fr);gap:28px;max-width:1180px;margin:0 auto;padding:24px 20px 64px}
.side{position:sticky;top:76px;align-self:start;max-height:calc(100vh - 96px);overflow:auto}
.side input{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);font:inherit}
.side ul{list-style:none;margin:14px 0;padding:0}.side li a{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;border-radius:8px;text-decoration:none;color:var(--ink)}
.side li a:hover,.side li a.on{background:var(--code-bg)}.side li a span{color:var(--muted);font-size:.78rem;background:var(--code-bg);border-radius:99px;padding:0 7px;min-width:22px;text-align:center}
.count{color:var(--muted);font-size:.88rem;margin:0 0 10px}.acts{display:flex;gap:8px;flex-wrap:wrap}
button{font:inherit;font-size:.85rem;padding:6px 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);cursor:pointer}
button:hover{background:var(--code-bg)}
.hero{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:20px 22px;margin-bottom:18px}
h1{margin:0 0 8px;font-size:1.7rem}h2{margin:0 0 14px;font-size:1.25rem;color:var(--teal)}h4{margin:18px 0 8px;font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
h4 small{text-transform:none;letter-spacing:0;font-weight:400}
.kv{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:10px 0}.kv span{color:var(--muted);font-size:.9rem}
.steps{padding-left:1.2em}.steps li{margin:6px 0}
.sec{margin:26px 0}
.op{background:var(--surface);border:1px solid var(--line);border-radius:10px;margin:8px 0;overflow:hidden}
.op>summary{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:11px 14px;cursor:pointer;list-style:none}
.op>summary::-webkit-details-marker{display:none}.op>summary::before{content:"▸";color:var(--muted);transition:transform .15s}.op[open]>summary::before{transform:rotate(90deg)}
.op[open]>summary{border-bottom:1px solid var(--line)}
.m{min-width:66px;text-align:center;padding:3px 8px;border-radius:6px;font-weight:700;font-size:.78rem;letter-spacing:.03em}
.m.get{color:var(--get);background:var(--get-bg)}.m.post{color:var(--post);background:var(--post-bg)}.m.put{color:var(--put);background:var(--put-bg)}
.m.patch{color:var(--patch);background:var(--patch-bg)}.m.delete{color:var(--delete);background:var(--delete-bg)}
.p{background:none;padding:0;font-size:.92rem;font-weight:600;word-break:break-all}.p i{color:var(--teal);font-style:normal}
.s{color:var(--muted);flex:1 1 220px;font-size:.92rem}.lock,.pub{font-size:.78rem;padding:2px 8px;border-radius:99px;border:1px solid var(--line);color:var(--muted);white-space:nowrap}
.pub{color:var(--post)}
.body{padding:4px 16px 18px}.tw{overflow-x:auto;margin:6px 0}
table{width:100%;border-collapse:collapse;font-size:.9rem}th{text-align:left;color:var(--muted);font-weight:600;font-size:.78rem;text-transform:uppercase;letter-spacing:.04em}
th,td{padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:top}tr.dep td{opacity:.65}
.req{margin-left:8px;font-size:.7rem;color:var(--delete);border:1px solid currentColor;border-radius:99px;padding:0 6px}
.resp{margin:6px 0}.rhead{display:flex;align-items:center;flex-wrap:wrap;gap:10px}.fields summary{cursor:pointer;color:var(--accent);font-size:.88rem;margin:4px 0}
.code{display:inline-block;min-width:44px;text-align:center;padding:1px 8px;border-radius:6px;font-weight:700;font-size:.82rem}
.c2{color:var(--post);background:var(--post-bg)}.c4,.c5{color:var(--delete);background:var(--delete-bg)}
.tag{font-size:.72rem;color:var(--teal);border:1px solid currentColor;border-radius:99px;padding:0 7px}
.code-wrap{position:relative}pre{margin:6px 0;padding:14px 16px;background:var(--code-bg);border-radius:8px;overflow-x:auto}pre code{background:none;padding:0}
.copy{position:absolute;top:12px;right:8px}.muted{color:var(--muted)}footer{margin-top:36px;color:var(--muted);font-size:.88rem}
@media (max-width:820px){.layout{grid-template-columns:1fr;padding:16px}.side{position:static;max-height:none}.side ul{display:flex;flex-wrap:wrap;gap:6px}.side li a{border:1px solid var(--line)}.top{padding:10px 16px;position:static}.top a:first-child{margin-left:0}.s{flex-basis:100%}html{scroll-padding-top:16px}}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}.op>summary::before{transition:none}}
`;

// ── Script (servi sur /docs/app.js) : filtre, tout déplier/replier, copie des exemples ──
const CLIENT_JS = `(function(){
var q=document.getElementById('q'),ops=[].slice.call(document.querySelectorAll('.op')),secs=[].slice.call(document.querySelectorAll('.sec')),
shown=document.getElementById('shown'),none=document.getElementById('none');
function apply(){var t=(q.value||'').toLowerCase().trim(),n=0;
ops.forEach(function(o){var ok=!t||o.getAttribute('data-search').indexOf(t)>-1;o.hidden=!ok;if(ok)n++;if(t&&ok)o.open=false;});
secs.forEach(function(s){s.hidden=!s.querySelector('.op:not([hidden])');});
shown.textContent=n;none.hidden=n>0;}
if(q){q.addEventListener('input',apply);}
document.getElementById('expand').addEventListener('click',function(){ops.forEach(function(o){if(!o.hidden)o.open=true;});});
document.getElementById('collapse').addEventListener('click',function(){ops.forEach(function(o){o.open=false;});});
document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('.copy');if(!b)return;
var code=b.parentNode.querySelector('code').textContent;
(navigator.clipboard?navigator.clipboard.writeText(code):Promise.reject()).then(function(){b.textContent='Copié';setTimeout(function(){b.textContent='Copier';},1500);},function(){b.textContent='Sélectionnez puis copiez';});});
if(location.hash){var t=document.getElementById(location.hash.slice(1));if(t&&t.tagName==='DETAILS')t.open=true;}
var links=[].slice.call(document.querySelectorAll('.side li a')),tick=false;
function mark(){tick=false;var cur=null;secs.forEach(function(x){if(!x.hidden&&x.getBoundingClientRect().top<=140)cur=x.id;});
links.forEach(function(a){a.classList.toggle('on',a.getAttribute('data-sec')===cur);});}
window.addEventListener('scroll',function(){if(!tick){tick=true;requestAnimationFrame(mark);}},{passive:true});mark();
})();`;

module.exports = { renderPage, CSS, CLIENT_JS, flatten, sample, resolve };
