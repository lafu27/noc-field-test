'use strict';
/**
 * Genera GUIA.md a partir del escenario, así la guía nunca se desincroniza
 * de lo que hace el simulador.   Uso:  npm run guia
 */
const fs = require('fs');
const path = require('path');
const { PHASES, STEPS, SERVERS } = require('../src/scenario');

const SSH_SECONDS = 15;
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

let host = 'bastion';
let clock = 0;
const rows = []; // { phase, t, host, cmd, note, objective, ssh }

STEPS.forEach((s) => {
  if (s.host !== host) {
    clock += SSH_SECONDS;
    rows.push({ phase: s.phase, t: clock, host: s.host, cmd: `ssh ops@${s.host}`, note: `Salto a ${s.host} (${SERVERS[s.host].ip}).`, objective: 'Conexión', ssh: true });
    host = s.host;
  }
  clock += s.t || 30;
  rows.push({ phase: s.phase, t: clock, host: s.host, cmd: s.cmd, note: s.note || '', objective: s.objective });
  if (s.fx && s.fx.hostReset) host = 'bastion';
});

// Ritmo objetivo: el último comando cae cerca del minuto 29 (queda 1 min de margen).
const scale = 1740 / rows.at(-1).t;
rows.forEach((r) => { r.t = Math.round(r.t * scale); });
const total = rows.at(-1).t;
const ranges = {};
PHASES.forEach((p, i) => {
  const pr = rows.filter((r) => r.phase === p.id);
  const prevEnd = i === 0 ? 0 : ranges[PHASES[i - 1].id].end;
  ranges[p.id] = { start: prevEnd, end: pr.at(-1).t };
});
const md = [];
md.push('# Guía de la ventana MW-2026-1022 (≈ 30 min)');
md.push('');
md.push('> Esta guía es el “guion” completo de la prueba de campo. Está **generada automáticamente** desde `src/scenario.js` (`npm run guia`).');
md.push('> Los tiempos son una estimación de ritmo cómodo; el simulador en sí no te apura salvo por el reloj de 30:00.');
md.push('');
md.push('## Resumen');
md.push('');
md.push(`- **Pasos con comando:** ${rows.length} (${rows.filter((r) => r.ssh).length} de ellos son \`ssh\` entre hosts)`);
md.push(`- **Duración estimada:** ${mmss(total)} hasta el último comando (cierre de ventana ≈ 29:00–30:00, ritmo objetivo)`);
md.push('- **Hosts:** ' + Object.entries(SERVERS).map(([h, s]) => `\`${h}\` (${s.ip})`).join(', '));
md.push('');
md.push('## Cómo usar esta guía');
md.push('');
md.push('1. Abrí el simulador (`npm start` → http://localhost:3000) y apretá **INICIAR VENTANA**.');
md.push('2. La esquina inferior derecha muestra, en letra muy chica, el comando exacto del paso actual. Esta guía lo anticipa.');
md.push('3. Cuando el paso es en otro host, primero tenés que hacer `ssh` (la pista lo muestra solo).');
md.push('4. La columna **Qué mirar** son los datos que conviene leer en pantalla antes de seguir (cantidades, porcentajes, estados).');
md.push('');

PHASES.forEach((p) => {
  const pr = rows.filter((r) => r.phase === p.id);
  md.push(`## ${p.id} · ${p.name}  \`${mmss(ranges[p.id].start)} – ${mmss(ranges[p.id].end)}\``);
  md.push('');
  md.push(p.desc);
  md.push('');
  md.push('| T+ aprox. | Host | Comando | Qué mirar |');
  md.push('|-----------|------|---------|-----------|');
  pr.forEach((r) => {
    const cmd = r.cmd.replace(/\|/g, '\\|');
    md.push(`| ${mmss(r.t)} | \`${r.host}\` | \`${cmd}\` | ${r.note} |`);
  });
  md.push('');
});

md.push('## Cifras clave para recordar');
md.push('');
md.push('| Dato | Valor |');
md.push('|------|-------|');
md.push('| Paquetes actualizables en web-01/web-02 | 47 (44 actualizados + 3 nuevos) |');
md.push('| Kernel antes → después | 5.15.0-122 → 5.15.0-126 |');
md.push('| db-01 disco `/` | 91 % → 63 % |');
md.push('| Causa raíz del incidente | `legacy-etl` con `LOG_LEVEL=DEBUG` (≈ 9 GB/día) |');
md.push('| Backup verificado | `db-01_2026-10-22.dump` (13 GB) → 18.422.917 filas en `orders` |');
md.push('| Intentos SSH fallidos | 1.912 (1.684 desde 203.0.113.45) |');
md.push('| Puerto expuesto | 3306/tcp (regla nº 5 de ufw) |');
md.push('| Certificado TLS | vence en 6 días → renovado hasta 20/01/2027 |');
md.push('');
md.push('## Si te trabás');
md.push('');
md.push('- **“command not found” o “argumentos inválidos”:** revisá espacios y comillas.');
md.push('- **“Esta tarea corresponde a X”:** estás en otro host; hacé `ssh ops@X`.');
md.push('- **“Connection refused” al hacer ssh:** el host se está reiniciando; esperá y usá `ping` desde el bastión.');
md.push('- **Tab** completa el comando de la pista si ya escribiste el comienzo. **Esc** oculta/muestra la pista.');
md.push('');

fs.writeFileSync(path.join(__dirname, '..', 'GUIA.md'), md.join('\n'));
console.log(PHASES.map((p) => `${p.id} ${mmss(ranges[p.id].start)} – ${mmss(ranges[p.id].end)}`).join(' | '));
console.log(`GUIA.md generada: ${rows.length} comandos, ~${mmss(total)} estimados.`);
