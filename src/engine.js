'use strict';
/**
 * Motor de la simulación (sin dependencias). Lo usa server.js (Express) y las pruebas.
 * Nada de lo que hace toca el sistema real: son respuestas pre-escritas.
 */
const crypto = require('crypto');
const { SERVERS, PHASES, STEPS } = require('./scenario');

const WINDOW_SECONDS = 30 * 60;
const MONITORED = Object.keys(SERVERS).filter((h) => SERVERS[h].monitored);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const normCmd = (s) =>
  String(s).trim().replace(/\s+/g, ' ').replace(/[“”‘’"]/g, "'");

function createEngine() {
  const games = new Map();

  /* ---------------- partida ---------------- */
  function newGame() {
    const m = {};
    const status = {};
    MONITORED.forEach((h) => {
      const b = SERVERS[h].base;
      m[h] = { cpu: b.cpu, mem: b.mem, disk: b.disk, net: b.net, tcpu: b.cpu, tmem: b.mem, tdisk: b.disk, tnet: b.net };
      status[h] = 'ok';
    });
    return { touched: Date.now(), startedAt: null, finishedAt: null, idx: 0, host: 'bastion', m, status, alerts: [], log: [], cmds: [], patched: {} };
  }

  function getGame(sid) {
    if (!sid || typeof sid !== 'string' || sid.length > 64) sid = crypto.randomUUID();
    let g = games.get(sid);
    if (!g) { g = newGame(); games.set(sid, g); }
    g.touched = Date.now();
    return { sid, g };
  }

  const timer = setInterval(() => {
    const limit = Date.now() - 6 * 3600 * 1000;
    for (const [k, g] of games) if (g.touched < limit) games.delete(k);
  }, 15 * 60 * 1000);
  if (timer.unref) timer.unref();

  const elapsed = (g) => (g.startedAt ? Math.floor(((g.finishedAt || Date.now()) - g.startedAt) / 1000) : 0);

  function pushAlert(g, a) {
    g.alerts.push({ t: elapsed(g), lvl: a.lvl, msg: a.msg });
    if (g.alerts.length > 60) g.alerts.shift();
  }

  function applyFx(g, fx) {
    if (!fx) return;
    if (fx.set) {
      for (const h of Object.keys(fx.set)) {
        const m = g.m[h]; if (!m) continue;
        const v = fx.set[h];
        if (v.cpu != null) m.tcpu = v.cpu;
        if (v.mem != null) m.tmem = v.mem;
        if (v.disk != null) m.tdisk = v.disk;
        if (v.net != null) m.tnet = v.net;
      }
    }
    if (fx.status) {
      Object.assign(g.status, fx.status);
      for (const h of Object.keys(fx.status)) if (fx.status[h] === 'reboot') g.patched[h] = true;
    }
    if (fx.alerts) fx.alerts.forEach((a) => pushAlert(g, a));
    if (fx.hostReset) g.host = 'bastion';
  }

  /* ---------------- salida ---------------- */
  function toLines(arr, pace) {
    return arr.map((raw) => {
      const m = /^(?:@(\d+) )?([\s\S]*)$/.exec(raw);
      const delay = m[1] != null ? Number(m[1]) : null;
      const text = m[2];
      return { t: text, d: delay == null ? pace : delay, pause: delay != null && text.trim() === '' };
    });
  }

  const expectedCmd = (step, host) => (host !== step.host ? `ssh ops@${step.host}` : step.cmd);

  function dateLine() {
    const d = new Date();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const p = (n) => String(n).padStart(2, '0');
    return `${days[d.getDay()]} ${mon[d.getMonth()]} ${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} -03 2026`;
  }

  function loginBanner(g, host) {
    const s = SERVERS[host];
    const mm = g.m[host];
    const disk = (mm ? mm.disk : s.base.disk).toFixed(1);
    return [
      `Welcome to Ubuntu 22.04.4 LTS (GNU/Linux 5.15.0-${g.patched[host] ? '126' : '122'}-generic x86_64)`,
      '',
      ' * Documentation:  https://help.ubuntu.com',
      ' * Management:     https://landscape.canonical.com',
      '',
      `  System load:  ${(0.2 + Math.random() * 0.4).toFixed(2)}            Processes:             ${120 + Math.floor(Math.random() * 40)}`,
      `  Usage of /:   ${disk}% of 49.10GB   Users logged in:       1`,
      `  Memory usage: ${(mm ? mm.mem : s.base.mem).toFixed(0)}%               IPv4 address for eth0: ${s.ip}`,
      '',
      '!dim *** Acceso restringido. Toda la actividad se registra (ticket MW-2026-1022). ***',
      'Last login: Wed Oct 21 22:41:07 2026 from 10.20.0.2',
    ];
  }

  function builtin(g, cmd) {
    const [bin, ...args] = cmd.split(' ');
    switch (bin) {
      case 'whoami': return ['ops'];
      case 'id': return ['uid=1001(ops) gid=1001(ops) groups=1001(ops),4(adm),27(sudo),110(lxd)'];
      case 'hostname': return [g.host];
      case 'pwd': return ['/home/ops'];
      case 'date': return [dateLine()];
      case 'echo': return [args.join(' ').replace(/^'|'$/g, '')];
      case 'ls': return ['notas.txt  scripts  tmp'];
      case 'uptime': return [` ${new Date().toTimeString().slice(0, 8)} up 41 days,  6:${String(12 + Math.floor(elapsed(g) / 60) % 48).padStart(2, '0')},  1 user,  load average: 0.46, 0.44, 0.41`];
      case 'history': return g.cmds.slice(-15).map((c, i) => `  ${String(i + 1).padStart(3)}  ${c}`);
      case 'help': return [
        '!dim GNU bash, versión 5.1.16(1)-release (x86_64-pc-linux-gnu)',
        '!dim Seguí el runbook de la ventana MW-2026-1022. La pista del paso actual está en la esquina.',
        '!dim Tab completa comandos del runbook. Flecha ↑ recupera el historial.',
      ];
      default: return undefined;
    }
  }

  function finish(g) { g.finishedAt = Date.now(); }

  /* ---------------- métricas ---------------- */
  function tickMetrics(g) {
    const j = (k) => (Math.random() - 0.5) * k;
    for (const h of MONITORED) {
      const m = g.m[h];
      m.cpu = clamp(m.cpu + (m.tcpu - m.cpu) * 0.35 + j(3), 1, 99);
      m.mem = clamp(m.mem + (m.tmem - m.mem) * 0.2 + j(0.8), 1, 99);
      m.net = clamp(m.net + (m.tnet - m.net) * 0.35 + j(5), 0, 99);
      m.disk = clamp(m.disk + (m.tdisk - m.disk) * 0.18, 1, 99.5);
    }
  }

  function snapshot(sid, g) {
    tickMetrics(g);
    const done = g.idx >= STEPS.length;
    const step = done ? null : STEPS[g.idx];
    return {
      sid,
      started: !!g.startedAt,
      finished: done,
      elapsed: elapsed(g),
      windowSeconds: WINDOW_SECONDS,
      host: g.host,
      prompt: `ops@${g.host}:~$`,
      stepIndex: g.idx,
      totalSteps: STEPS.length,
      phase: step ? step.phase : 'P7',
      objective: step ? step.objective : 'Ventana cerrada.',
      objectiveHost: step ? step.host : null,
      hint: step ? expectedCmd(step, g.host) : '',
      phases: PHASES.map((p) => {
        const idxs = STEPS.map((s, i) => (s.phase === p.id ? i : -1)).filter((i) => i >= 0);
        return { id: p.id, name: p.name, eta: p.eta, desc: p.desc, done: idxs.filter((i) => i < g.idx).length, total: idxs.length };
      }),
      servers: MONITORED.map((h) => {
        const m = g.m[h];
        const rb = g.status[h] === 'reboot';
        return { id: h, ip: SERVERS[h].ip, role: SERVERS[h].role, status: g.status[h], cpu: rb ? 0 : +m.cpu.toFixed(1), mem: rb ? 0 : +m.mem.toFixed(1), net: rb ? 0 : +m.net.toFixed(1), disk: +m.disk.toFixed(1) };
      }),
      alerts: g.alerts.slice(-30),
      result: done ? { elapsed: elapsed(g), overtime: elapsed(g) > WINDOW_SECONDS } : null,
    };
  }

  /* ---------------- API del motor ---------------- */
  function state(sid) { const x = getGame(sid); return snapshot(x.sid, x.g); }

  function start(sid) {
    const { sid: id, g } = getGame(sid);
    if (!g.startedAt) { g.startedAt = Date.now(); applyFx(g, STEPS[0].enter); }
    return snapshot(id, g);
  }

  function reset(sid) {
    const id = sid || crypto.randomUUID();
    games.set(id, newGame());
    return snapshot(id, games.get(id));
  }

  function exec(sid, rawIn) {
    const { sid: id, g } = getGame(sid);
    const raw = String(rawIn || '').slice(0, 500);
    const cmd = normCmd(raw);
    const reply = (lines, extra = {}) => ({ ok: true, lines: toLines(lines, extra.pace || 18), prompt: `ops@${g.host}:~$`, host: g.host, ...extra, state: snapshot(id, g) });

    if (!g.startedAt) return reply(['!warn La ventana todavía no fue abierta.']);
    if (g.idx >= STEPS.length) return reply(['!dim La ventana ya está cerrada.']);
    if (!cmd) return reply([]);

    g.cmds.push(raw.trim());
    if (g.cmds.length > 300) g.cmds.shift();
    if (cmd === 'clear') return reply([], { clear: true });

    const step = STEPS[g.idx];
    const accepted = [step.cmd, ...(step.alt || [])].map(normCmd);

    // 1) comando esperado en el host correcto
    if (g.host === step.host && accepted.includes(cmd)) {
      g.log.push({ t: elapsed(g), host: step.host, cmd: step.cmd, objective: step.objective });
      applyFx(g, step.fx);
      g.idx += 1;
      if (g.idx >= STEPS.length) finish(g); else applyFx(g, STEPS[g.idx].enter);
      return reply(step.out, { pace: step.pace || 18, advanced: true, finished: g.idx >= STEPS.length });
    }

    // 2) ssh
    const sshm = /^ssh (?:-l ops |ops@)?([a-z0-9-]+)$/.exec(cmd);
    if (sshm) {
      const target = sshm[1];
      if (!SERVERS[target]) return reply([`ssh: Could not resolve hostname ${target}: Name or service not known`], { pace: 10 });
      if (g.status[target] === 'reboot') return reply([`@900 ssh: connect to host ${target} port 22: Connection refused`], { pace: 10 });
      if (target === g.host) return reply(['!dim Ya estás conectado a ese host.']);
      g.host = target;
      g.log.push({ t: elapsed(g), host: target, cmd: `ssh ops@${target}`, objective: 'Conexión SSH' });
      return reply(['@500 Authenticated with public key (ed25519).', ...loginBanner(g, target)], { pace: 35 });
    }

    // 3) exit
    if (cmd === 'exit' || cmd === 'logout') {
      if (g.host === 'bastion') return reply(['!dim El bastión es la sesión raíz; cerrar acá terminaría la ventana.']);
      const from = g.host;
      g.host = 'bastion';
      return reply(['logout', `Connection to ${from} closed.`]);
    }

    // 4) comando del runbook, host equivocado
    if (accepted.includes(cmd)) {
      return reply([`!warn Esta tarea corresponde a ${step.host} (estás en ${g.host}). Conectate primero.`], { error: true });
    }

    // 5) relleno
    const b = builtin(g, cmd);
    if (b !== undefined) return reply(b);

    // 6) error
    const first = cmd.split(' ').filter((w) => w !== 'sudo')[0];
    const expFirst = normCmd(step.cmd).split(' ').filter((w) => w !== 'sudo')[0];
    if (first === expFirst && g.host === step.host) {
      return reply([`!err ${first}: argumentos inválidos o incompletos`, `!dim Probá '${first} --help'. Revisá el objetivo del paso actual.`], { error: true });
    }
    return reply([`bash: ${cmd.split(' ')[0]}: command not found`], { error: true });
  }

  function report(sid) {
    const { g } = getGame(sid);
    const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    const L = [];
    L.push('# Reporte de ventana MW-2026-1022', '');
    L.push('- Operador: ops');
    L.push(`- Duración: ${fmt(elapsed(g))} (ventana autorizada: 30:00)`);
    L.push(`- Pasos completados: ${Math.min(g.idx, STEPS.length)}/${STEPS.length}`);
    L.push('', '## Hallazgos');
    L.push('1. db-01: legacy-etl con LOG_LEVEL=DEBUG llenó / al 91 % (≈9 GB/día de logs desde el 14/10).');
    L.push('2. edge-fw: puerto 3306/tcp expuesto a Internet por una regla permisiva.');
    L.push('3. edge-fw: fuerza bruta SSH (1.684 intentos desde 203.0.113.45).');
    L.push('4. web-01: certificado TLS venciendo en 6 días (renovado).', '');
    L.push('## Bitácora de comandos', '', '| T+ | Host | Comando |', '|----|------|---------|');
    g.log.forEach((e) => L.push(`| ${fmt(e.t)} | ${e.host} | \`${e.cmd.replace(/\|/g, '\\|')}\` |`));
    L.push('', '_Documento generado por NOC Field Test (simulación)._');
    return L.join('\n');
  }

  return { state, start, reset, exec, report };
}

module.exports = { createEngine };
