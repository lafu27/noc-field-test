'use strict';
/* NOC Field Test — cliente. Todo lo que ves es simulación contra el servidor local. */

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, '0');
const mmss = (s) => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;

const params = new URLSearchParams(location.search);
const TAB_ENABLED = params.get('tab') !== 'off';

let sid = null;
try { sid = localStorage.getItem('noc_sid'); } catch (e) { /* sin storage */ }
if (!sid) {
  sid = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  try { localStorage.setItem('noc_sid', sid); } catch (e) { /* ignorar */ }
}

let state = null;
let busy = false;
let abort = false;
let hintHidden = params.get('hint') === 'off';
try { if (localStorage.getItem('noc_hint_hidden') === '1') hintHidden = true; } catch (e) { /* ignorar */ }
let clockBase = { at: Date.now(), elapsed: 0 };
let endShown = false;
const history = [];
let histPos = 0;
const sparkData = {};
const SPARK_LEN = 48;
const rebootingHosts = new Set();

const api = async (path, body) => {
  const opt = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sid, ...body }) } : {};
  const url = body ? path : `${path}${path.includes('?') ? '&' : '?'}sid=${encodeURIComponent(sid)}`;
  const r = await fetch(url, opt);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

/* ---------------------------------------------------------------- terminal */
const out = $('#out');
const input = $('#cmd');

function renderText(el, text) {
  const m = /^([\s\S]*?)!(ok|warn|err|dim|cy) ([\s\S]*)$/.exec(text);
  if (!m) { el.textContent = text; return; }
  if (m[1] === '') {
    el.classList.add(m[2]);
    el.textContent = m[3];
  } else {
    el.appendChild(document.createTextNode(m[1]));
    const sp = document.createElement('span');
    sp.className = m[2];
    sp.textContent = m[3];
    el.appendChild(sp);
  }
}

function addLine(text) {
  const d = document.createElement('div');
  d.className = 'l';
  renderText(d, text);
  out.appendChild(d);
  while (out.childElementCount > 1600) out.removeChild(out.firstChild);
  out.scrollTop = out.scrollHeight;
}

function addEcho(prompt, cmd) {
  const d = document.createElement('div');
  d.className = 'l cmdecho';
  const p = document.createElement('span');
  p.className = 'p';
  p.textContent = prompt + ' ';
  d.appendChild(p);
  d.appendChild(document.createTextNode(cmd));
  out.appendChild(d);
  out.scrollTop = out.scrollHeight;
}

async function printLines(lines) {
  for (const l of lines) {
    if (abort) { addLine('^C'); break; }
    if (l.d) await sleep(l.d);
    if (l.pause) continue;
    addLine(l.t);
  }
}

function setBusy(b) {
  busy = b;
  input.disabled = b;
  if (!b) input.focus();
}

async function runCommand(raw) {
  const cmd = raw.trim();
  addEcho($('#prompt').textContent, raw);
  if (!cmd) return;
  history.push(cmd);
  histPos = history.length;
  setBusy(true);
  abort = false;
  try {
    const r = await api('/api/exec', { cmd });
    if (r.clear) out.innerHTML = '';
    await printLines(r.lines);
    $('#prompt').textContent = r.prompt;
    state = r.state;
    clockBase = { at: Date.now(), elapsed: state.elapsed };
  } catch (e) {
    addLine('!err Error de conexión con el servidor: ' + e.message);
  }
  setBusy(false);
  render();
}

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const v = input.value;
    input.value = '';
    runCommand(v);
  } else if (e.key === 'ArrowUp') {
    if (histPos > 0) { histPos--; input.value = history[histPos] || ''; }
    e.preventDefault();
  } else if (e.key === 'ArrowDown') {
    if (histPos < history.length) { histPos++; input.value = history[histPos] || ''; }
    e.preventDefault();
  } else if (e.key === 'Tab') {
    e.preventDefault();
    if (TAB_ENABLED && state && state.hint && input.value && state.hint.startsWith(input.value)) {
      input.value = state.hint;
    }
  } else if (e.key === 'l' && e.ctrlKey) {
    e.preventDefault();
    out.innerHTML = '';
  } else if (e.key === 'Escape') {
    toggleHint();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'c' && e.ctrlKey && busy) { abort = true; }
  if (e.key === 'Escape' && document.activeElement !== input) toggleHint();
});
$('#term').addEventListener('click', () => { if (!busy && window.getSelection().toString() === '') input.focus(); });

/* ---------------------------------------------------------------- hint */
function toggleHint() {
  hintHidden = !hintHidden;
  try { localStorage.setItem('noc_hint_hidden', hintHidden ? '1' : '0'); } catch (e) { /* ignorar */ }
  renderHint();
}

function renderHint() {
  const h = $('#hint');
  h.classList.toggle('off', hintHidden);
  h.classList.toggle('big', params.get('hint') === 'big');
  if (!state || busy || state.finished || !state.started) { h.textContent = ''; return; }
  h.textContent = `› ${state.hint}`;
}
$('#hint').addEventListener('click', () => {
  if (state && state.hint && navigator.clipboard) navigator.clipboard.writeText(state.hint).catch(() => {});
});

/* ---------------------------------------------------------------- servidores */
const srvEls = {};
const METRICS = [['cpu', 'CPU'], ['mem', 'MEM'], ['disk', 'DSK'], ['net', 'NET']];

function buildServers(list) {
  const root = $('#servers');
  root.innerHTML = '';
  list.forEach((s) => {
    sparkData[s.id] = [];
    const el = document.createElement('div');
    el.className = 'srv';
    el.innerHTML = `
      <div class="srv-h"><span class="dot"></span><span class="srv-name">${s.id}</span><span class="srv-role">${s.role}</span></div>
      <div class="srv-ip">${s.ip}</div>
      <div class="rebootmsg" hidden>⟳ REINICIANDO…</div>
      <div class="bars">${METRICS.map(([k, n]) => `<span>${n}</span><div class="bar"><i data-k="${k}"></i></div><span class="val" data-v="${k}">–</span>`).join('')}</div>
      <canvas class="spark" height="26"></canvas>`;
    root.appendChild(el);
    srvEls[s.id] = el;
  });
}

function drawSpark(canvas, data, color) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 260;
  const h = 26;
  if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  if (data.length < 2) return;
  c.beginPath();
  data.forEach((v, i) => {
    const x = (i / (SPARK_LEN - 1)) * w;
    const y = h - 2 - (v / 100) * (h - 4);
    i ? c.lineTo(x, y) : c.moveTo(x, y);
  });
  c.strokeStyle = color; c.lineWidth = 1.4; c.stroke();
  c.lineTo((data.length - 1) / (SPARK_LEN - 1) * w, h); c.lineTo(0, h); c.closePath();
  c.fillStyle = color + '22'; c.fill();
}

function renderServers() {
  if (!state) return;
  if (!Object.keys(srvEls).length) buildServers(state.servers);
  state.servers.forEach((s) => {
    const el = srvEls[s.id];
    if (!el) return;
    el.className = `srv ${s.status === 'ok' ? '' : s.status}`;
    el.querySelector('.rebootmsg').hidden = s.status !== 'reboot';
    if (s.status === 'reboot') rebootingHosts.add(s.id); else rebootingHosts.delete(s.id);
    METRICS.forEach(([k]) => {
      const v = s[k];
      const i = el.querySelector(`i[data-k="${k}"]`);
      i.style.width = `${v}%`;
      i.className = v >= 85 ? 'hi' : v >= 65 ? 'mid' : '';
      el.querySelector(`[data-v="${k}"]`).textContent = s.status === 'reboot' && k !== 'disk' ? '--' : `${Math.round(v)}%`;
    });
    const arr = sparkData[s.id];
    arr.push(s.cpu);
    if (arr.length > SPARK_LEN) arr.shift();
    const col = s.status === 'crit' ? '#ff5d6c' : s.status === 'warn' ? '#ffb547' : '#35d0ff';
    drawSpark(el.querySelector('canvas'), arr, col);
  });
  renderTopo();
}

/* ---------------------------------------------------------------- topología */
const TOPO = {
  'edge-fw': [140, 20], 'web-01': [60, 68], 'web-02': [220, 68], 'db-01': [140, 112], 'bak-01': [140, 150],
};
const LINKS = [['edge-fw', 'web-01'], ['edge-fw', 'web-02'], ['web-01', 'db-01'], ['web-02', 'db-01'], ['db-01', 'bak-01']];

function renderTopo() {
  const svg = $('#topo');
  const st = {};
  state.servers.forEach((s) => (st[s.id] = s.status));
  let h = '';
  LINKS.forEach(([a, b]) => {
    const down = st[a] === 'reboot' || st[b] === 'reboot';
    h += `<line class="link ${down ? '' : 'flow'}" x1="${TOPO[a][0]}" y1="${TOPO[a][1]}" x2="${TOPO[b][0]}" y2="${TOPO[b][1]}"/>`;
  });
  Object.entries(TOPO).forEach(([id, [x, y]]) => {
    h += `<g class="node ${st[id] === 'ok' ? '' : st[id]}"><rect x="${x - 34}" y="${y - 11}" width="68" height="22" rx="5"/><text x="${x}" y="${y + 3}">${id}</text></g>`;
  });
  h += '<text x="140" y="8" fill="#5d7189" font-size="7" text-anchor="middle" font-family="monospace">INTERNET</text>';
  svg.innerHTML = h;
}

/* ---------------------------------------------------------------- alertas / fases / header */
let lastAlertKey = '';
function renderAlerts() {
  const key = state.alerts.length + '|' + (state.alerts.at(-1) || {}).msg;
  if (key === lastAlertKey) return;
  lastAlertKey = key;
  const box = $('#alerts');
  if (!state.alerts.length) { box.innerHTML = '<div class="empty">Sin alertas.</div>'; return; }
  box.innerHTML = state.alerts.slice().reverse().map((a) =>
    `<div class="alert ${a.lvl}"><span class="at">T+${mmss(a.t)}</span>${a.msg.replace(/</g, '&lt;')}</div>`).join('');
}

function renderPhases() {
  const cont = $('#phases');
  cont.innerHTML = state.phases.map((p) => {
    const cls = p.done >= p.total ? 'done' : p.id === state.phase && !state.finished ? 'active' : '';
    const pct = Math.round((p.done / p.total) * 100);
    return `<div class="ph ${cls}"><div class="ph-h"><span class="ph-n">${p.name}</span><span class="ph-eta">${p.eta}</span></div>
      <div class="ph-d">${p.desc}</div><div class="ph-bar"><i style="width:${pct}%"></i></div></div>`;
  }).join('');
  const bar = $('#phasebar');
  if (bar.childElementCount !== state.phases.length) bar.innerHTML = state.phases.map(() => '<div class="pseg"><i></i></div>').join('');
  [...bar.children].forEach((seg, i) => {
    const p = state.phases[i];
    seg.classList.toggle('done', p.done >= p.total);
    seg.firstChild.style.width = `${Math.round((p.done / p.total) * 100)}%`;
  });
}

function renderClock() {
  const c = $('#clock');
  if (!state || !state.started) { c.textContent = mmss(state ? state.windowSeconds : 1800); return; }
  const el = state.finished ? state.elapsed : clockBase.elapsed + Math.floor((Date.now() - clockBase.at) / 1000);
  const left = state.windowSeconds - el;
  c.className = 'clock-val' + (left < 0 ? ' over' : left < 300 ? ' warn' : '');
  c.textContent = left >= 0 ? mmss(left) : '+' + mmss(-left);
}

function render() {
  if (!state) return;
  renderServers();
  renderAlerts();
  renderPhases();
  renderClock();
  if (!busy) {
    $('#objective').textContent = state.objective;
    $('#stepcount').textContent = state.finished ? '' : `PASO ${state.stepIndex + 1}/${state.totalSteps}`;
    $('#prompt').textContent = state.prompt;
    renderHint();
  }
  if (state.finished && state.result && !endShown && !busy) showEnd();
}

/* ---------------------------------------------------------------- pantallas */
function showEnd() {
  endShown = true;
  const r = state.result;
  setTimeout(() => {
    $('#endTitle').textContent = r.overtime ? 'Ventana cerrada fuera de tiempo' : 'Mantenimiento completado a tiempo';
    $('#endStats').innerHTML = [
      ['Tiempo', mmss(r.elapsed)], ['Ventana', '30:00'], ['Hosts OK', '5/5'],
    ].map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('');
    $('#dl').href = `/api/report?sid=${encodeURIComponent(sid)}`;
    $('#end').classList.remove('hidden');
  }, 1200);
}

$('#again').addEventListener('click', async () => {
  await api('/api/reset', {});
  location.reload();
});

$('#startBtn').addEventListener('click', async () => {
  state = await api('/api/start', {});
  clockBase = { at: Date.now(), elapsed: state.elapsed };
  $('#brief').classList.add('hidden');
  addLine('!cy NOC Field Test · bastión de salto bastion (10.20.0.2)');
  addLine('!dim Sesión iniciada como ops. Escribí los comandos del runbook; usá ssh para saltar entre hosts.');
  addLine('');
  render();
  input.focus();
});

/* ---------------------------------------------------------------- log ambiente */
const HOSTS_STREAM = ['web-01', 'web-02', 'db-01', 'edge-fw', 'bak-01'];
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const ip = () => `${rnd(['10.20.0', '203.0.113', '198.51.100'])}.${ri(2, 250)}`;
const TEMPL = {
  'web-01': () => [`nginx[914]: ${ip()} - - "${rnd(['GET /api/v2/items?page=' + ri(1, 9), 'GET /static/app.' + ri(100, 999) + '.js', 'POST /api/v2/cart', 'GET /health'])} HTTP/1.1" ${rnd([200, 200, 200, 304, 404])} ${ri(200, 9000)}`, ''],
  'web-02': () => [`nginx[877]: ${ip()} - - "${rnd(['GET /', 'GET /products/' + ri(1, 900), 'GET /health', 'POST /api/v2/checkout'])} HTTP/1.1" ${rnd([200, 200, 200, 301, 502])} ${ri(200, 9000)}`, ''],
  'db-01': () => [rnd([`postgres[2210]: LOG:  checkpoint complete: wrote ${ri(900, 9000)} buffers`, `postgres[${ri(3300, 3500)}]: LOG:  duration: ${ri(1, 90)}.${ri(100, 999)} ms  statement: SELECT ...`, `postgres[2210]: LOG:  automatic vacuum of table "shop.public.orders"`]), ''],
  'edge-fw': () => [`kernel: [UFW BLOCK] IN=eth0 SRC=${ip()} DST=203.0.113.10 PROTO=TCP DPT=${rnd([22, 23, 3389, 8080, 445])}`, 'w'],
  'bak-01': () => [rnd([`CRON[${ri(1000, 9999)}]: (backup) CMD (/opt/backup/heartbeat.sh)`, `rsyslogd: action 'action-3' resumed`]), ''],
};

function streamTick() {
  const box = $('#stream');
  const pool = HOSTS_STREAM.filter((h) => !rebootingHosts.has(h));
  if (!pool.length) return;
  const h = rnd(pool);
  const [msg, cls] = TEMPL[h]();
  const d = document.createElement('div');
  const t = new Date();
  d.textContent = `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())} ${h} ${msg}`;
  if (cls) d.className = cls;
  box.appendChild(d);
  while (box.childElementCount > 14) box.removeChild(box.firstChild);
}
(function loopStream() { if (state && state.started && !state.finished) streamTick(); setTimeout(loopStream, ri(450, 1300)); })();

/* ---------------------------------------------------------------- bucle de estado */
async function poll() {
  try {
    const s = await api('/api/state');
    if (!busy) {
      state = s;
      clockBase = { at: Date.now(), elapsed: s.elapsed };
      if (!s.started) $('#brief').classList.remove('hidden');
      render();
    } else if (state) {
      // mientras se imprime una salida, solo refrescamos métricas
      state.servers = s.servers; state.alerts = s.alerts; state.elapsed = s.elapsed;
      renderServers(); renderAlerts();
    }
  } catch (e) { /* servidor caído: reintenta */ }
}

(async function init() {
  await poll();
  if (state && state.started && !state.finished) {
    $('#brief').classList.add('hidden');
    addLine('!cy Sesión restaurada. (El historial de pantalla no se conserva al recargar.)');
    addLine('!dim Seguí con el paso indicado en OBJETIVO; la pista está abajo a la derecha.');
    input.focus();
  }
  setInterval(poll, 1500);
  setInterval(renderClock, 500);
})();
