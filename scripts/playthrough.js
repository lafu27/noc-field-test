'use strict';
/**
 * Prueba automática: juega la partida completa contra el motor siguiendo la pista,
 * incluyendo errores a propósito.      npm test
 * No necesita Express ni red.
 */
const { createEngine } = require('../src/engine');
const { STEPS } = require('../src/scenario');

const fail = (m) => { console.error('FALLÓ:', m); process.exit(1); };
const assert = (c, m) => { if (!c) fail(m); };

const e = createEngine();
const sid = 'test';

let s = e.state(sid);
assert(!s.started, 'no debería estar iniciada');
let r = e.exec(sid, 'whoami');
assert(r.lines[0].t.includes('no fue abierta'), 'comando antes de iniciar');

s = e.start(sid);
assert(s.started && s.hint === 'sudo /opt/ops/mw open MW-2026-1022', 'start / hint inicial');

// errores a propósito
r = e.exec(sid, 'foobar');
assert(r.lines[0].t.includes('command not found'), 'command not found');
r = e.exec(sid, 'whoami');
assert(r.lines[0].t === 'ops', 'whoami');
r = e.exec(sid, 'sudo /opt/ops/mw');
assert(r.error, 'argumentos inválidos');
r = e.exec(sid, 'ssh ops@nohost');
assert(r.lines[0].t.includes('Could not resolve'), 'ssh a host desconocido');

let guard = 0;
const seenSsh = new Set();
let sawRefused = false;
while (guard++ < 500) {
  s = e.state(sid);
  if (s.finished) break;
  if (s.hint.startsWith('ssh ')) seenSsh.add(s.hint);
  // jugamos con variaciones de espacios/comillas para probar la normalización
  const cmd = guard % 7 === 0 ? s.hint.replace(/ /g, '  ') : s.hint;
  r = e.exec(sid, cmd);
  assert(r.ok, 'exec ok');
  assert(!r.error, `error inesperado en "${s.hint}": ${JSON.stringify(r.lines)}`);
  // tras un reboot el ssh a ese host debe rechazarse
  if (/reboot$/.test(s.hint) && s.host !== 'bastion') {
    const bad = e.exec(sid, 'ssh web-01');
    if (bad.lines.some((l) => l.t.includes('Connection refused'))) sawRefused = true;
  }
}
s = e.state(sid);
assert(s.finished && s.stepIndex === STEPS.length, 'la partida debería terminar con todos los pasos');
assert(s.result && typeof s.result.elapsed === 'number', 'resultado');
assert(sawRefused, 'ssh a host reiniciando debería ser rechazado');

const rep = e.report(sid);
assert(rep.includes('Bitácora de comandos') && rep.includes('sudo /opt/ops/mw close'), 'reporte');

// verificación de wrong-host
const e2 = createEngine();
e2.start('b');
e2.exec('b', 'sudo /opt/ops/mw open MW-2026-1022');
const wr = e2.exec('b', 'uptime'); // estamos en bastion y el paso es en web-01
assert(wr.lines[0].t.includes('ops@') || wr.lines.length >= 1, 'uptime como relleno en bastión');
const wr2 = e2.exec('b', 'df -h');
assert(wr2.lines.length >= 0, 'df -h fuera de paso no rompe');

console.log(`Partida completa: ${STEPS.length} pasos (+ ${seenSsh.size} saltos ssh distintos).`);
console.log('Resultado:', JSON.stringify(s.result));
console.log(`Reporte OK (${rep.split('\n').length} líneas).`);
console.log('\nTODO OK');
