'use strict';
/**
 * Escenario: ventana de mantenimiento MW-2026-1022 (30 min).
 * Todo es SIMULADO: no se conecta a ningún servidor real.
 *
 * Convenciones en las líneas de salida (strings):
 *   "@800 texto"   -> espera 800 ms antes de mostrar la línea
 *   "!ok texto"    -> color verde   (!warn ámbar, !err rojo, !dim gris, !cy cian)
 *   Se pueden combinar: "@800 !ok texto"
 *
 * Campos de cada paso:
 *   host      servidor donde se ejecuta (si no estás ahí, el motor pide `ssh` primero)
 *   cmd       comando canónico que se muestra como pista en la esquina
 *   alt       variantes aceptadas
 *   objective qué se está haciendo (texto visible, SIN el comando)
 *   note      qué mirar en la salida (aparece en la guía)
 *   t         segundos estimados para el paso (para armar la guía)
 *   enter     efectos al volverse el paso activo (alertas, métricas, estados)
 *   fx        efectos al completarse el paso
 *   out       salida del comando
 */

const SERVERS = {
  bastion:  { ip: '10.20.0.2',  role: 'Bastión / salto',        monitored: false, base: { cpu: 6,  mem: 22, disk: 31, net: 3 } },
  'edge-fw':{ ip: '10.20.0.1',  role: 'Firewall perimetral',    monitored: true,  base: { cpu: 14, mem: 35, disk: 28, net: 46 } },
  'web-01': { ip: '10.20.0.11', role: 'Web · nginx',            monitored: true,  base: { cpu: 21, mem: 39, disk: 58, net: 34 } },
  'web-02': { ip: '10.20.0.12', role: 'Web · nginx',            monitored: true,  base: { cpu: 19, mem: 41, disk: 55, net: 31 } },
  'db-01':  { ip: '10.20.0.21', role: 'Base de datos · PG 14',  monitored: true,  base: { cpu: 33, mem: 62, disk: 78, net: 18 } },
  'bak-01': { ip: '10.20.0.31', role: 'Backups',                monitored: true,  base: { cpu: 5,  mem: 18, disk: 64, net: 4 } },
};

const PHASES = [
  { id: 'P1', name: 'Apertura y reconocimiento', eta: '00:00 – 02:33', desc: 'Abrir la ventana de cambios y revisar el estado base de web-01.' },
  { id: 'P2', name: 'Parcheo web-01',            eta: '02:33 – 06:41', desc: 'Actualizar paquetes, reiniciar por kernel y validar el servicio.' },
  { id: 'P3', name: 'Parcheo web-02',            eta: '06:41 – 09:42', desc: 'Repetir el procedimiento en el segundo nodo web (rolling).' },
  { id: 'P4', name: 'Incidente en db-01',        eta: '09:42 – 16:17', desc: 'Disco al 91 %: encontrar la causa, corregir y liberar espacio.' },
  { id: 'P5', name: 'Verificación de backups',   eta: '16:17 – 21:11', desc: 'Validar integridad y probar una restauración real en bak-01.' },
  { id: 'P6', name: 'Seguridad y red',           eta: '21:11 – 27:24', desc: 'Fuerza bruta SSH, puerto 3306 expuesto y certificado por vencer.' },
  { id: 'P7', name: 'Cierre de ventana',         eta: '27:24 – 29:00', desc: 'Verificar todo y cerrar el ticket con el reporte final.' },
];

/* ---------- helpers de salida ---------- */
const APT_UPDATE = [
  'Hit:1 http://ar.archive.ubuntu.com/ubuntu jammy InRelease',
  '@350 Get:2 http://ar.archive.ubuntu.com/ubuntu jammy-updates InRelease [128 kB]',
  '@250 Get:3 http://security.ubuntu.com/ubuntu jammy-security InRelease [129 kB]',
  'Hit:4 http://ar.archive.ubuntu.com/ubuntu jammy-backports InRelease',
  '@500 Get:5 http://ar.archive.ubuntu.com/ubuntu jammy-updates/main amd64 Packages [1,812 kB]',
  '@300 Get:6 http://security.ubuntu.com/ubuntu jammy-security/main amd64 Packages [1,521 kB]',
  '@300 Get:7 http://ar.archive.ubuntu.com/ubuntu jammy-updates/universe amd64 Packages [1,134 kB]',
  '@600 Fetched 4,724 kB in 3s (1,611 kB/s)',
  '@400 Reading package lists... Done',
  'Building dependency tree... Done',
  'Reading state information... Done',
  '!warn 47 packages can be upgraded. Run \'apt list --upgradable\' to see them.',
];

const PKGS = [
  ['linux-image-5.15.0-126-generic', '5.15.0-126.136'],
  ['linux-modules-5.15.0-126-generic', '5.15.0-126.136'],
  ['linux-headers-5.15.0-126', '5.15.0-126.136'],
  ['openssl', '3.0.2-0ubuntu1.18'],
  ['libssl3', '3.0.2-0ubuntu1.18'],
  ['nginx', '1.18.0-6ubuntu14.5'],
  ['nginx-common', '1.18.0-6ubuntu14.5'],
  ['curl', '7.81.0-1ubuntu1.18'],
  ['libcurl4', '7.81.0-1ubuntu1.18'],
  ['tzdata', '2024b-0ubuntu0.22.04.1'],
];

function aptUpgrade(withReboot) {
  const out = [
    'Reading package lists... Done',
    'Building dependency tree... Done',
    'Reading state information... Done',
    'Calculating upgrade... Done',
    'The following NEW packages will be installed:',
    '  linux-headers-5.15.0-126 linux-image-5.15.0-126-generic linux-modules-5.15.0-126-generic',
    'The following packages will be upgraded:',
    '  curl libcurl4 libssl3 nginx nginx-common openssl tzdata python3-urllib3',
    '  ... (47 paquetes en total)',
    '!warn 44 upgraded, 3 newly installed, 0 to remove and 0 not upgraded.',
    'Need to get 189 MB of archives.',
    'After this operation, 412 MB of additional disk space will be used.',
  ];
  PKGS.forEach((p, i) => out.push(`@${i < 3 ? 700 : 240} Get:${i + 1} http://ar.archive.ubuntu.com/ubuntu jammy-updates/main amd64 ${p[0]} amd64 ${p[1]} [${i < 3 ? '14.2 MB' : '1,204 kB'}]`));
  out.push('@900 Fetched 189 MB in 21s (9,012 kB/s)');
  PKGS.forEach((p) => {
    out.push(`@120 Preparing to unpack .../${p[0]}_${p[1]}_amd64.deb ...`);
    out.push(`@60 Unpacking ${p[0]} (${p[1]}) ...`);
  });
  PKGS.forEach((p) => out.push(`@110 Setting up ${p[0]} (${p[1]}) ...`));
  out.push('@300 Processing triggers for man-db (2.10.2-1) ...');
  out.push('Processing triggers for libc-bin (2.35-0ubuntu3.8) ...');
  out.push('@500 Scanning processes...');
  out.push('Scanning linux images...');
  out.push(withReboot ? '!warn Pending kernel upgrade! Running kernel version: 5.15.0-122-generic (expected: 5.15.0-126-generic).' : 'Running kernel seems to be up-to-date.');
  out.push('No services need to be restarted.');
  out.push('No containers need to be restarted.');
  out.push('No user sessions are running outdated binaries.');
  return out;
}

const LOGIN = null; // el banner de login lo genera el servidor

/* ---------- pasos ---------- */
const STEPS = [
  /* ===== P1 · Apertura y reconocimiento ===== */
  {
    phase: 'P1', host: 'bastion', t: 35,
    cmd: 'sudo /opt/ops/mw open MW-2026-1022',
    objective: 'Abrir la ventana de mantenimiento en el sistema de control de cambios.',
    note: 'Ventana 03:00–03:30, 5 hosts en alcance, aprobadores M. Ferreyra y L. Quiroga.',
    out: [
      '!cy [mw] Autenticando contra change-control.interno ... OK',
      '@500 !cy [mw] Ticket MW-2026-1022  "Parcheo trimestral + verificación de backups"',
      '!cy [mw] Ventana autorizada: 03:00 – 03:30 (America/Argentina/Buenos_Aires)',
      '!cy [mw] Aprobadores: M. Ferreyra (infra), L. Quiroga (seguridad)',
      '!cy [mw] Hosts en alcance: web-01 web-02 db-01 bak-01 edge-fw',
      '@600 !cy [mw] Notificando a #ops-guardia ... enviado',
      '@300 !ok [mw] Ventana ABIERTA. Cuenta regresiva: 30:00',
    ],
    fx: { alerts: [{ lvl: 'info', msg: 'Ventana MW-2026-1022 en curso.' }] },
  },
  {
    phase: 'P1', host: 'web-01', t: 20,
    cmd: 'uptime',
    objective: 'web-01: revisar uptime y carga antes de tocar nada.',
    note: 'Uptime 41 días, load average ~0.5: el servidor está sano.',
    out: [' 03:01:12 up 41 days,  6:12,  1 user,  load average: 0.52, 0.47, 0.44'],
  },
  {
    phase: 'P1', host: 'web-01', t: 20,
    cmd: 'df -h',
    objective: 'web-01: verificar espacio en disco antes de actualizar (se bajan ~190 MB).',
    note: '/ al 58 % (27G usados, 20G libres): alcanza de sobra.',
    out: [
      'Filesystem      Size  Used Avail Use% Mounted on',
      'tmpfs           794M  1.2M  793M   1% /run',
      '/dev/sda2        49G   27G   20G  58% /',
      'tmpfs           3.9G     0  3.9G   0% /dev/shm',
      '/dev/sda1       512M  6.1M  506M   2% /boot/efi',
    ],
  },
  {
    phase: 'P1', host: 'web-01', t: 20,
    cmd: 'free -m',
    objective: 'web-01: revisar memoria disponible.',
    note: '7937 MB totales, 4411 MB disponibles, swap casi sin uso (12 MB).',
    out: [
      '               total        used        free      shared  buff/cache   available',
      'Mem:            7937        3122        1204         118        3610        4411',
      'Swap:           2047          12        2035',
    ],
  },
  {
    phase: 'P1', host: 'web-01', t: 25,
    cmd: 'systemctl status nginx --no-pager',
    objective: 'web-01: confirmar que nginx está activo antes del parcheo.',
    note: 'active (running) desde hace 41 días; 3 workers.',
    out: [
      '● nginx.service - A high performance web server and a reverse proxy server',
      '     Loaded: loaded (/lib/systemd/system/nginx.service; enabled; vendor preset: enabled)',
      '     Active: !ok active (running) since Thu 2026-09-10 20:49:03 -03; 41 days ago',
      '       Docs: man:nginx(8)',
      '   Main PID: 912 (nginx)',
      '      Tasks: 4 (limit: 9262)',
      '     Memory: 14.8M',
      '     CGroup: /system.slice/nginx.service',
      '             ├─912 "nginx: master process /usr/sbin/nginx -g daemon on; master_process on;"',
      '             ├─913 "nginx: worker process"',
      '             ├─914 "nginx: worker process"',
      '             └─915 "nginx: worker process"',
    ],
  },

  /* ===== P2 · Parcheo web-01 ===== */
  {
    phase: 'P2', host: 'web-01', t: 30,
    cmd: 'sudo apt update',
    objective: 'web-01: refrescar el índice de paquetes.',
    note: 'Resultado clave: 47 paquetes actualizables.',
    out: APT_UPDATE,
    fx: { set: { 'web-01': { net: 78, cpu: 28 } } },
  },
  {
    phase: 'P2', host: 'web-01', t: 30,
    cmd: 'apt list --upgradable 2>/dev/null | head -n 10',
    alt: ['apt list --upgradable | head -n 10'],
    objective: 'web-01: revisar qué paquetes se van a actualizar (kernel, openssl, nginx, curl).',
    note: 'Entre ellos hay kernel nuevo (5.15.0-126): vamos a necesitar reinicio.',
    out: [
      '!dim Listing...',
      'curl/jammy-updates,jammy-security 7.81.0-1ubuntu1.18 amd64 [upgradable from: 7.81.0-1ubuntu1.16]',
      'libcurl4/jammy-updates,jammy-security 7.81.0-1ubuntu1.18 amd64 [upgradable from: 7.81.0-1ubuntu1.16]',
      'libssl3/jammy-updates,jammy-security 3.0.2-0ubuntu1.18 amd64 [upgradable from: 3.0.2-0ubuntu1.15]',
      'linux-generic/jammy-updates,jammy-security 5.15.0.126.126 amd64 [upgradable from: 5.15.0.122.122]',
      'linux-headers-generic/jammy-updates,jammy-security 5.15.0.126.126 amd64 [upgradable from: 5.15.0.122.122]',
      'linux-image-generic/jammy-updates,jammy-security 5.15.0.126.126 amd64 [upgradable from: 5.15.0.122.122]',
      'nginx/jammy-updates,jammy-security 1.18.0-6ubuntu14.5 amd64 [upgradable from: 1.18.0-6ubuntu14.4]',
      'nginx-common/jammy-updates,jammy-security 1.18.0-6ubuntu14.5 all [upgradable from: 1.18.0-6ubuntu14.4]',
      'openssl/jammy-updates,jammy-security 3.0.2-0ubuntu1.18 amd64 [upgradable from: 3.0.2-0ubuntu1.15]',
    ],
  },
  {
    phase: 'P2', host: 'web-01', t: 55,
    cmd: 'sudo apt upgrade -y',
    objective: 'web-01: aplicar las 47 actualizaciones.',
    note: 'Descarga de 189 MB; al final avisa “Pending kernel upgrade”.',
    out: aptUpgrade(true),
    pace: 25,
    enter: { set: { 'web-01': { cpu: 74, net: 88 } } },
    fx: { set: { 'web-01': { cpu: 24, net: 30, disk: 61 } } },
  },
  {
    phase: 'P2', host: 'web-01', t: 15,
    cmd: 'cat /var/run/reboot-required',
    objective: 'web-01: confirmar si el sistema pide reinicio.',
    note: 'Pide reinicio por el kernel nuevo.',
    out: ['*** System restart required ***'],
  },
  {
    phase: 'P2', host: 'web-01', t: 15,
    cmd: 'sudo reboot',
    objective: 'web-01: reiniciar para cargar el kernel 5.15.0-126.',
    note: 'La conexión SSH se corta; el servidor queda en REINICIANDO unos segundos.',
    out: [
      '@600 !warn Broadcast message from root@web-01 (Thu 2026-10-22 03:07:40 -03):',
      '!warn The system is going down for reboot NOW!',
      '@900 Connection to web-01 closed by remote host.',
      'Connection to web-01 closed.',
    ],
    fx: {
      hostReset: true,
      status: { 'web-01': 'reboot' },
      alerts: [{ lvl: 'warn', msg: 'web-01: sin latido del agente de monitoreo.' }],
    },
  },
  {
    phase: 'P2', host: 'bastion', t: 25,
    cmd: 'ping -c 4 web-01',
    objective: 'Desde el bastión: esperar a que web-01 vuelva a responder.',
    note: 'Primero “Destination Host Unreachable”, después responde (~0.4 ms).',
    out: [
      'PING web-01 (10.20.0.11) 56(84) bytes of data.',
      '@1500 !err From 10.20.0.2 icmp_seq=1 Destination Host Unreachable',
      '@1500 !err From 10.20.0.2 icmp_seq=2 Destination Host Unreachable',
      '@2200 !ok 64 bytes from 10.20.0.11: icmp_seq=3 ttl=64 time=0.412 ms',
      '@1000 !ok 64 bytes from 10.20.0.11: icmp_seq=4 ttl=64 time=0.388 ms',
      '',
      '--- web-01 ping statistics ---',
      '4 packets transmitted, 2 received, +2 errors, 50% packet loss, time 6212ms',
      'rtt min/avg/max/mdev = 0.388/0.400/0.412/0.012 ms',
    ],
    fx: { status: { 'web-01': 'ok' }, alerts: [{ lvl: 'ok', msg: 'web-01: latido del agente restablecido.' }] },
  },
  {
    phase: 'P2', host: 'web-01', t: 15,
    cmd: 'uname -r',
    objective: 'web-01: verificar que arrancó con el kernel nuevo.',
    note: 'Debe decir 5.15.0-126-generic.',
    out: ['!ok 5.15.0-126-generic'],
  },
  {
    phase: 'P2', host: 'web-01', t: 20,
    cmd: 'systemctl is-active nginx',
    objective: 'web-01: confirmar que nginx levantó solo.',
    note: 'Responde “active”.',
    out: ['!ok active'],
    fx: { alerts: [{ lvl: 'ok', msg: 'web-01: health-check del balanceador OK.' }] },
  },

  /* ===== P3 · Parcheo web-02 ===== */
  {
    phase: 'P3', host: 'web-02', t: 55,
    cmd: 'sudo apt update && sudo apt upgrade -y',
    objective: 'web-02: mismo procedimiento, actualizar índice y paquetes en un solo paso.',
    note: 'Misma lista de 47 paquetes; vuelve a pedir reinicio.',
    out: [...APT_UPDATE, ...aptUpgrade(true)],
    pace: 22,
    enter: { set: { 'web-02': { cpu: 20 } } },
    fx: { set: { 'web-02': { disk: 58 } } },
  },
  {
    phase: 'P3', host: 'web-02', t: 15,
    cmd: 'sudo reboot',
    objective: 'web-02: reiniciar por kernel (web-01 ya atiende el tráfico).',
    note: 'Es seguro porque web-01 ya está parcheado y de vuelta en el pool.',
    out: [
      '@500 !warn Broadcast message from root@web-02 (Thu 2026-10-22 03:13:05 -03):',
      '!warn The system is going down for reboot NOW!',
      '@800 Connection to web-02 closed by remote host.',
      'Connection to web-02 closed.',
    ],
    fx: {
      hostReset: true,
      status: { 'web-02': 'reboot' },
      alerts: [{ lvl: 'warn', msg: 'web-02: sin latido del agente de monitoreo.' }],
    },
  },
  {
    phase: 'P3', host: 'bastion', t: 25,
    cmd: 'ping -c 4 web-02',
    objective: 'Bastión: esperar el regreso de web-02.',
    note: 'Misma secuencia: unreachable y después respuesta.',
    out: [
      'PING web-02 (10.20.0.12) 56(84) bytes of data.',
      '@1500 !err From 10.20.0.2 icmp_seq=1 Destination Host Unreachable',
      '@1500 !err From 10.20.0.2 icmp_seq=2 Destination Host Unreachable',
      '@2000 !ok 64 bytes from 10.20.0.12: icmp_seq=3 ttl=64 time=0.431 ms',
      '@1000 !ok 64 bytes from 10.20.0.12: icmp_seq=4 ttl=64 time=0.402 ms',
      '',
      '--- web-02 ping statistics ---',
      '4 packets transmitted, 2 received, +2 errors, 50% packet loss, time 6190ms',
      'rtt min/avg/max/mdev = 0.402/0.416/0.431/0.014 ms',
    ],
    fx: { status: { 'web-02': 'ok' } },
  },
  {
    phase: 'P3', host: 'web-02', t: 15,
    cmd: 'uname -r',
    objective: 'web-02: verificar kernel nuevo.',
    note: '5.15.0-126-generic.',
    out: ['!ok 5.15.0-126-generic'],
  },
  {
    phase: 'P3', host: 'web-02', t: 20,
    cmd: 'curl -sI http://localhost | head -n 1',
    objective: 'web-02: probar que el sitio responde localmente.',
    note: 'HTTP/1.1 200 OK.',
    out: ['!ok HTTP/1.1 200 OK'],
    fx: { alerts: [{ lvl: 'ok', msg: 'web-02: health-check del balanceador OK.' }] },
  },

  /* ===== P4 · Incidente en db-01 ===== */
  {
    phase: 'P4', host: 'db-01', t: 25,
    cmd: 'df -h',
    objective: 'ALERTA CRÍTICA en db-01: revisar el uso de disco.',
    note: '/ está al 91 % (89G de 98G). El volumen de datos de Postgres está bien (60 %).',
    enter: {
      set: { 'db-01': { disk: 91, cpu: 61, net: 24 } },
      status: { 'db-01': 'crit' },
      alerts: [
        { lvl: 'crit', msg: 'db-01: latencia elevada en consultas (p95 > 4 s).' },
        { lvl: 'warn', msg: 'Escalamiento a guardia programado.' },
      ],
    },
    out: [
      'Filesystem      Size  Used Avail Use% Mounted on',
      'tmpfs           1.6G  1.3M  1.6G   1% /run',
      '/dev/sda2        98G   89G  9.1G !err 91% /',
      '/dev/sdb1       200G  118G   82G  60% /var/lib/postgresql',
      '/dev/sda1       512M  6.1M  506M   2% /boot/efi',
    ],
  },
  {
    phase: 'P4', host: 'db-01', t: 30,
    cmd: 'sudo du -sh /var/log/* | sort -h | tail -n 5',
    objective: 'db-01: encontrar qué está llenando /var/log.',
    note: 'Sospechoso: /var/log/app-debug con 61G.',
    out: [
      '48M\t/var/log/syslog.1',
      '112M\t/var/log/auth.log',
      '1.4G\t/var/log/postgresql',
      '3.8G\t/var/log/journal',
      '!err 61G\t/var/log/app-debug',
    ],
  },
  {
    phase: 'P4', host: 'db-01', t: 25,
    cmd: 'sudo ls -lh /var/log/app-debug | head -n 8',
    objective: 'db-01: inspeccionar los archivos de app-debug.',
    note: 'Un log de ~9 GB por día desde el 14/10: alguien dejó el modo DEBUG.',
    out: [
      'total 61G',
      '-rw-r--r-- 1 etl etl 9.2G Oct 14 23:59 etl-2026-10-14.log',
      '-rw-r--r-- 1 etl etl 9.4G Oct 15 23:59 etl-2026-10-15.log',
      '-rw-r--r-- 1 etl etl 9.1G Oct 16 23:59 etl-2026-10-16.log',
      '-rw-r--r-- 1 etl etl 9.6G Oct 17 23:59 etl-2026-10-17.log',
      '-rw-r--r-- 1 etl etl 9.3G Oct 18 23:59 etl-2026-10-18.log',
      '-rw-r--r-- 1 etl etl 9.8G Oct 19 23:59 etl-2026-10-19.log',
      '-rw-r--r-- 1 etl etl 4.5G Oct 22 03:14 etl-2026-10-22.log',
    ],
  },
  {
    phase: 'P4', host: 'db-01', t: 40,
    cmd: 'sudo journalctl -u postgresql --since "1 hour ago" --no-pager | tail -n 8',
    objective: 'db-01: ver qué dice Postgres sobre la lentitud.',
    note: 'Consultas lentas y checkpoints demorados por presión de I/O; todavía sin errores fatales.',
    out: [
      'Oct 22 03:08:11 db-01 postgres[2210]: [4-1] LOG:  checkpoint starting: time',
      'Oct 22 03:08:44 db-01 postgres[2210]: [5-1] !warn LOG:  checkpoint complete: wrote 18211 buffers (11.1%); sync=9.402 s',
      'Oct 22 03:10:02 db-01 postgres[3380]: [6-1] !warn LOG:  duration: 4210.331 ms  statement: SELECT o.id, o.total FROM orders o JOIN ...',
      'Oct 22 03:10:31 db-01 postgres[3391]: [6-1] !warn LOG:  duration: 3877.019 ms  statement: UPDATE stock SET qty = qty - 1 WHERE sku = ...',
      'Oct 22 03:11:17 db-01 postgres[2210]: [7-1] LOG:  checkpoint starting: time',
      'Oct 22 03:11:58 db-01 postgres[2210]: [8-1] !warn LOG:  checkpoint complete: wrote 20877 buffers (12.7%); sync=11.870 s',
      'Oct 22 03:13:05 db-01 postgres[3402]: [6-1] !warn LOG:  duration: 5102.114 ms  statement: SELECT count(*) FROM audit_log WHERE ...',
      'Oct 22 03:14:20 db-01 postgres[2210]: [9-1] LOG:  checkpoint starting: time',
    ],
  },
  {
    phase: 'P4', host: 'db-01', t: 25,
    cmd: 'sudo systemctl status legacy-etl --no-pager',
    objective: 'db-01: revisar el servicio que escribe en app-debug.',
    note: 'legacy-etl corre con LOG_LEVEL=DEBUG.',
    out: [
      '● legacy-etl.service - Legacy ETL batch loader',
      '     Loaded: loaded (/etc/systemd/system/legacy-etl.service; enabled; vendor preset: enabled)',
      '     Active: !ok active (running) since Tue 2026-10-14 09:02:41 -03; 1 week 1 day ago',
      '   Main PID: 1877 (etl-loader)',
      '      Tasks: 9 (limit: 18512)',
      '     Memory: 1.1G',
      '     CGroup: /system.slice/legacy-etl.service',
      '             └─1877 /opt/etl/bin/etl-loader --config /etc/legacy-etl/etl.env',
      '',
      'Oct 14 09:02:41 db-01 systemd[1]: Started Legacy ETL batch loader.',
      'Oct 14 09:02:42 db-01 etl-loader[1877]: !warn LOG_LEVEL=DEBUG (override from change CHG-2291, expires: never)',
    ],
  },
  {
    phase: 'P4', host: 'db-01', t: 35,
    cmd: "sudo sed -i 's/LOG_LEVEL=DEBUG/LOG_LEVEL=INFO/' /etc/legacy-etl/etl.env",
    objective: 'db-01: devolver el nivel de log a INFO en la configuración.',
    note: 'No imprime nada: sed -i edita el archivo en el lugar.',
    out: [],
  },
  {
    phase: 'P4', host: 'db-01', t: 20,
    cmd: 'sudo systemctl restart legacy-etl',
    objective: 'db-01: reiniciar legacy-etl para que tome la configuración.',
    note: 'Tampoco imprime nada si sale bien.',
    out: ['@1200 '],
    fx: { set: { 'db-01': { cpu: 48 } } },
  },
  {
    phase: 'P4', host: 'db-01', t: 30,
    cmd: 'sudo find /var/log/app-debug -name "*.log" -mtime +1 -delete',
    objective: 'db-01: borrar los logs DEBUG viejos (más de 1 día).',
    note: 'Libera ~55 GB. El de hoy queda intacto por el -mtime +1.',
    out: ['@1800 '],
    fx: { set: { 'db-01': { disk: 78 } } },
  },
  {
    phase: 'P4', host: 'db-01', t: 25,
    cmd: 'sudo journalctl --vacuum-size=500M',
    objective: 'db-01: recortar el journal de systemd a 500 MB.',
    note: 'Libera ~3.3 GB de journals archivados.',
    out: [
      'Deleted archived journal /var/log/journal/9f1c2d/system@0005f2c8.journal (128.0M).',
      '@200 Deleted archived journal /var/log/journal/9f1c2d/system@0005f2d9.journal (128.0M).',
      '@200 Deleted archived journal /var/log/journal/9f1c2d/system@0005f2ea.journal (128.0M).',
      '@300 !ok Vacuuming done, freed 3.3G of archived journals from /var/log/journal/9f1c2d.',
    ],
    fx: { set: { 'db-01': { disk: 63 } } },
  },
  {
    phase: 'P4', host: 'db-01', t: 25,
    cmd: 'df -h',
    objective: 'db-01: confirmar que el disco se normalizó.',
    note: '/ bajó del 91 % al 63 %.',
    out: [
      'Filesystem      Size  Used Avail Use% Mounted on',
      'tmpfs           1.6G  1.3M  1.6G   1% /run',
      '/dev/sda2        98G   58G   35G !ok 63% /',
      '/dev/sdb1       200G  118G   82G  60% /var/lib/postgresql',
      '/dev/sda1       512M  6.1M  506M   2% /boot/efi',
    ],
    fx: {
      status: { 'db-01': 'ok' },
      set: { 'db-01': { cpu: 29, net: 18, disk: 63 } },
      alerts: [{ lvl: 'ok', msg: 'db-01: métricas de almacenamiento dentro de umbral.' }],
    },
  },
  {
    phase: 'P4', host: 'db-01', t: 35,
    cmd: 'sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity;"',
    objective: 'db-01: contar conexiones activas en Postgres.',
    note: '23 conexiones: normal.',
    out: [
      ' count ',
      '-------',
      '    23',
      '(1 row)',
      '',
    ],
  },
  {
    phase: 'P4', host: 'db-01', t: 20,
    cmd: 'sudo pg_lsclusters',
    objective: 'db-01: confirmar que el clúster está online.',
    note: 'Cluster 14/main online.',
    out: [
      'Ver Cluster Port Status Owner    Data directory              Log file',
      '14  main    5432 !ok online postgres /var/lib/postgresql/14/main /var/log/postgresql/postgresql-14-main.log',
    ],
  },

  /* ===== P5 · Verificación de backups ===== */
  {
    phase: 'P5', host: 'bak-01', t: 25,
    cmd: 'ls -lh /backups/daily',
    objective: 'bak-01: listar los backups diarios.',
    note: 'Hay un dump de ~13 GB por día; el del 21/10 es el último.',
    enter: { alerts: [{ lvl: 'info', msg: 'bak-01: job de backup nocturno completado 02:09.' }] },
    out: [
      'total 52G',
      '-rw-r----- 1 backup backup  13G Oct 19 02:11 db-01_2026-10-19.dump',
      '-rw-r----- 1 backup backup  13G Oct 20 02:10 db-01_2026-10-20.dump',
      '-rw-r----- 1 backup backup  13G Oct 21 02:12 db-01_2026-10-21.dump',
      '-rw-r----- 1 backup backup   97 Oct 21 02:12 db-01_2026-10-21.sha256',
      '-rw-r----- 1 backup backup  13G Oct 22 02:09 db-01_2026-10-22.dump',
      '-rw-r----- 1 backup backup   97 Oct 22 02:09 db-01_2026-10-22.sha256',
    ],
  },
  {
    phase: 'P5', host: 'bak-01', t: 35,
    cmd: 'sudo sha256sum -c /backups/daily/db-01_2026-10-22.sha256',
    objective: 'bak-01: verificar integridad del backup más reciente (22/10).',
    note: 'Tarda unos segundos (13 GB) y debe decir OK.',
    enter: { set: { 'bak-01': { cpu: 38, net: 6 } } },
    out: ['@4200 !ok /backups/daily/db-01_2026-10-22.dump: OK'],
    fx: { set: { 'bak-01': { cpu: 9 } } },
  },
  {
    phase: 'P5', host: 'bak-01', t: 35,
    cmd: 'sudo -u postgres pg_restore --list /backups/daily/db-01_2026-10-22.dump | head -n 12',
    objective: 'bak-01: inspeccionar el índice (TOC) del dump.',
    note: 'Muestra formato custom, base “shop”, versión 14.13.',
    out: [
      ';',
      '; Archive created at 2026-10-22 02:09:11 -03',
      ';     dbname: shop',
      ';     TOC Entries: 3511',
      ';     Compression: -1',
      ';     Dump Version: 1.14-0',
      ';     Format: CUSTOM',
      ';     Dumped from database version: 14.13 (Ubuntu 14.13-0ubuntu0.22.04.1)',
      ';',
      ';',
      '; Selected TOC Entries:',
      ';',
    ],
  },
  {
    phase: 'P5', host: 'bak-01', t: 20,
    cmd: 'sudo -u postgres createdb restore_test',
    objective: 'bak-01: crear una base temporal para la prueba de restauración.',
    note: 'No imprime nada si sale bien.',
    out: [],
  },
  {
    phase: 'P5', host: 'bak-01', t: 55,
    cmd: 'sudo -u postgres pg_restore -v -d restore_test /backups/daily/db-01_2026-10-22.dump',
    objective: 'bak-01: restaurar el dump real en la base temporal.',
    note: 'Salida larga en modo verbose; termina sin errores.',
    pace: 70,
    enter: { set: { 'bak-01': { cpu: 71, net: 12 } } },
    out: [
      'pg_restore: connecting to database for restore',
      'pg_restore: creating SCHEMA "public"',
      'pg_restore: creating EXTENSION "pgcrypto"',
      'pg_restore: creating TABLE "public.customers"',
      'pg_restore: creating TABLE "public.orders"',
      'pg_restore: creating TABLE "public.order_items"',
      'pg_restore: creating TABLE "public.stock"',
      'pg_restore: creating TABLE "public.audit_log"',
      'pg_restore: processing data for table "public.customers"',
      '@600 pg_restore: processing data for table "public.orders"',
      '@1200 pg_restore: processing data for table "public.order_items"',
      '@900 pg_restore: processing data for table "public.stock"',
      '@700 pg_restore: processing data for table "public.audit_log"',
      'pg_restore: creating CONSTRAINT "public.orders orders_pkey"',
      'pg_restore: creating CONSTRAINT "public.customers customers_pkey"',
      'pg_restore: creating INDEX "public.idx_orders_customer"',
      '@800 pg_restore: creating INDEX "public.idx_audit_created"',
      'pg_restore: creating FK CONSTRAINT "public.orders orders_customer_fk"',
      '@400 !ok pg_restore: finished (0 errors)',
    ],
    fx: { set: { 'bak-01': { cpu: 12, net: 4, disk: 71 } } },
  },
  {
    phase: 'P5', host: 'bak-01', t: 35,
    cmd: 'sudo -u postgres psql -d restore_test -c "SELECT count(*) FROM orders;"',
    objective: 'bak-01: comprobar que los datos restaurados existen.',
    note: '18.422.917 pedidos: coincide con producción (±0.1 %).',
    out: [
      '  count   ',
      '----------',
      ' 18422917',
      '(1 row)',
      '',
    ],
  },
  {
    phase: 'P5', host: 'bak-01', t: 20,
    cmd: 'sudo -u postgres dropdb restore_test',
    objective: 'bak-01: eliminar la base temporal.',
    note: 'Limpieza obligatoria: libera ~14 GB.',
    out: [],
    fx: { set: { 'bak-01': { disk: 64 } }, alerts: [{ lvl: 'ok', msg: 'bak-01: uso de disco estable.' }] },
  },
  {
    phase: 'P5', host: 'bak-01', t: 20,
    cmd: 'cat /etc/cron.d/backup-rotate',
    objective: 'bak-01: revisar la política de rotación.',
    note: 'Rotación diaria a las 02:30, retención de 14 días.',
    out: [
      '# Rotación de backups de db-01 (retención 14 días)',
      'SHELL=/bin/bash',
      'PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin',
      '30 2 * * * backup find /backups/daily -name "db-01_*" -mtime +14 -delete',
    ],
  },

  /* ===== P6 · Seguridad y red ===== */
  {
    phase: 'P6', host: 'edge-fw', t: 25,
    cmd: 'sudo grep -c "Failed password" /var/log/auth.log',
    objective: 'ALERTA en edge-fw: contar intentos fallidos de SSH.',
    note: '1912 intentos fallidos en el log actual.',
    enter: {
      status: { 'edge-fw': 'warn' },
      set: { 'edge-fw': { cpu: 31, net: 71 } },
      alerts: [{ lvl: 'warn', msg: 'edge-fw: pico de eventos de autenticación fallida.' }],
    },
    out: ['!err 1912'],
  },
  {
    phase: 'P6', host: 'edge-fw', t: 45,
    cmd: "sudo awk '/Failed password/ {print $(NF-3)}' /var/log/auth.log | sort | uniq -c | sort -rn | head -n 5",
    objective: 'edge-fw: identificar las IP que más intentan.',
    note: '203.0.113.45 hace 1.684 de los 1.912 intentos.',
    out: [
      '!err  1684 203.0.113.45',
      '    92 198.51.100.17',
      '    61 198.51.100.88',
      '    44 192.0.2.201',
      '    31 203.0.113.9',
    ],
  },
  {
    phase: 'P6', host: 'edge-fw', t: 25,
    cmd: 'sudo fail2ban-client status sshd',
    objective: 'edge-fw: revisar el estado del jail de fail2ban.',
    note: 'El jail está activo pero la IP atacante aún no está baneada.',
    out: [
      'Status for the jail: sshd',
      '|- Filter',
      '|  |- Currently failed:\t3',
      '|  |- Total failed:\t1912',
      '|  `- File list:\t/var/log/auth.log',
      '`- Actions',
      '   |- Currently banned:\t!warn 0',
      '   |- Total banned:\t0',
      '   `- Banned IP list:',
    ],
  },
  {
    phase: 'P6', host: 'edge-fw', t: 25,
    cmd: 'sudo fail2ban-client set sshd banip 203.0.113.45',
    objective: 'edge-fw: banear manualmente la IP atacante.',
    note: 'Devuelve 1 (una IP baneada).',
    out: ['!ok 1'],
    fx: { status: { 'edge-fw': 'ok' }, set: { 'edge-fw': { cpu: 16, net: 47 } }, alerts: [{ lvl: 'ok', msg: 'edge-fw: tasa de eventos de autenticación normalizada.' }] },
  },
  {
    phase: 'P6', host: 'edge-fw', t: 25,
    cmd: 'sudo ufw status numbered',
    objective: 'edge-fw: auditar reglas del firewall.',
    note: 'La regla [5] deja 3306/tcp (MySQL/MariaDB) abierta a Anywhere: no corresponde.',
    out: [
      'Status: active',
      '',
      '     To                         Action      From',
      '     --                         ------      ----',
      '[ 1] 22/tcp                     ALLOW IN    10.20.0.0/24',
      '[ 2] 80/tcp                     ALLOW IN    Anywhere',
      '[ 3] 443/tcp                    ALLOW IN    Anywhere',
      '[ 4] 5432/tcp                   ALLOW IN    10.20.0.0/24',
      '[ 5] !err 3306/tcp                  ALLOW IN    Anywhere',
      '[ 6] 80/tcp (v6)                ALLOW IN    Anywhere (v6)',
      '[ 7] 443/tcp (v6)               ALLOW IN    Anywhere (v6)',
    ],
    enter: { alerts: [{ lvl: 'warn', msg: 'Escáner externo: servicios de red expuestos detectados.' }] },
  },
  {
    phase: 'P6', host: 'edge-fw', t: 20,
    cmd: 'sudo ufw --force delete 5',
    objective: 'edge-fw: eliminar la regla que expone el puerto 3306.',
    note: 'Confirma “Rule deleted”.',
    out: ['!ok Rule deleted'],
  },
  {
    phase: 'P6', host: 'edge-fw', t: 20,
    cmd: 'sudo ufw status numbered',
    objective: 'edge-fw: confirmar que la regla ya no está.',
    note: 'Ahora hay 6 reglas y ninguna con 3306.',
    out: [
      'Status: active',
      '',
      '     To                         Action      From',
      '     --                         ------      ----',
      '[ 1] 22/tcp                     ALLOW IN    10.20.0.0/24',
      '[ 2] 80/tcp                     ALLOW IN    Anywhere',
      '[ 3] 443/tcp                    ALLOW IN    Anywhere',
      '[ 4] 5432/tcp                   ALLOW IN    10.20.0.0/24',
      '[ 5] 80/tcp (v6)                ALLOW IN    Anywhere (v6)',
      '[ 6] 443/tcp (v6)               ALLOW IN    Anywhere (v6)',
    ],
    fx: { alerts: [{ lvl: 'ok', msg: 'Escáner externo: sin hallazgos abiertos de exposición.' }] },
  },
  {
    phase: 'P6', host: 'web-01', t: 25,
    cmd: 'sudo certbot certificates',
    objective: 'web-01: revisar vencimiento de certificados TLS.',
    note: 'El certificado vence en 6 días (VALID: 6 days): hay que renovar.',
    enter: { alerts: [{ lvl: 'warn', msg: 'Monitor TLS: vencimiento próximo en shop.ejemplo.com.' }] },
    out: [
      'Saving debug log to /var/log/letsencrypt/letsencrypt.log',
      '',
      '- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -',
      'Found the following certs:',
      '  Certificate Name: shop.ejemplo.com',
      '    Serial Number: 4a7f3c91e2b8d0156c8e9a2f7d41b3c0a9e',
      '    Key Type: ECDSA',
      '    Domains: shop.ejemplo.com www.shop.ejemplo.com',
      '    Expiry Date: 2026-10-28 11:42:19+00:00 (!err VALID: 6 days)',
      '    Certificate Path: /etc/letsencrypt/live/shop.ejemplo.com/fullchain.pem',
      '    Private Key Path: /etc/letsencrypt/live/shop.ejemplo.com/privkey.pem',
      '- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -',
    ],
  },
  {
    phase: 'P6', host: 'web-01', t: 35,
    cmd: 'sudo certbot renew --force-renewal',
    objective: 'web-01: renovar el certificado ahora.',
    note: 'Debe terminar con “Congratulations, all renewals succeeded”.',
    out: [
      'Saving debug log to /var/log/letsencrypt/letsencrypt.log',
      '',
      '- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -',
      'Processing /etc/letsencrypt/renewal/shop.ejemplo.com.conf',
      '- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -',
      '@1500 Renewing an existing certificate for shop.ejemplo.com and www.shop.ejemplo.com',
      '@1800 ',
      '- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -',
      '!ok Congratulations, all renewals succeeded:',
      '  /etc/letsencrypt/live/shop.ejemplo.com/fullchain.pem (success)',
      '- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -',
    ],
  },
  {
    phase: 'P6', host: 'web-01', t: 15,
    cmd: 'sudo nginx -s reload',
    objective: 'web-01: recargar nginx para servir el certificado nuevo.',
    note: 'Sin salida si todo va bien.',
    out: [],
  },
  {
    phase: 'P6', host: 'web-01', t: 40,
    cmd: 'echo | openssl s_client -connect localhost:443 2>/dev/null | openssl x509 -noout -enddate',
    objective: 'web-01: verificar la nueva fecha de vencimiento en vivo.',
    note: 'Ahora vence en enero de 2027.',
    out: ['!ok notAfter=Jan 20 03:14:52 2027 GMT'],
    fx: { alerts: [{ lvl: 'ok', msg: 'Monitor TLS: sin vencimientos próximos.' }] },
  },

  /* ===== P7 · Cierre ===== */
  {
    phase: 'P7', host: 'bastion', t: 40,
    cmd: 'sudo /opt/ops/mw verify MW-2026-1022',
    objective: 'Bastión: ejecutar la verificación automática de todos los hosts.',
    note: 'Tabla con 5 hosts en OK.',
    out: [
      '!cy [mw] Verificando hosts en alcance ...',
      '@500 [mw] web-01   kernel 5.15.0-126   nginx active   disk 61%   !ok OK',
      '@400 [mw] web-02   kernel 5.15.0-126   nginx active   disk 58%   !ok OK',
      '@400 [mw] db-01    pg 14 online        latencia p95 38ms  disk 63%   !ok OK',
      '@400 [mw] bak-01   backup 22/10 verificado   restore test OK    !ok OK',
      '@400 [mw] edge-fw  3306 cerrado   1 IP baneada   !ok OK',
      '@500 !ok [mw] Verificación completa: 5/5 hosts OK, 0 pendientes.',
    ],
  },
  {
    phase: 'P7', host: 'bastion', t: 30,
    cmd: 'sudo /opt/ops/mw close MW-2026-1022 --report',
    objective: 'Bastión: cerrar la ventana y generar el reporte final.',
    note: 'Cierra el ticket y notifica a #ops-guardia.',
    out: [
      '!cy [mw] Cerrando ticket MW-2026-1022 ...',
      '@500 [mw] Generando reporte ... /var/reports/MW-2026-1022.pdf',
      '@500 !cy [mw] Notificando a #ops-guardia y a los aprobadores ... enviado',
      '@300 !ok [mw] Ventana CERRADA. Estado final: COMPLETADA CON HALLAZGOS.',
      '',
      '  Hallazgos: 3  (LOG_LEVEL=DEBUG en legacy-etl, puerto 3306 expuesto, fuerza bruta SSH)',
      '  Acciones:  7  (parches x2, limpieza de disco, backup verificado, ban IP, regla FW, certificado)',
    ],
    fx: { alerts: [{ lvl: 'ok', msg: 'Ventana MW-2026-1022 cerrada.' }] },
  },
];

/* Validación rápida al cargar */
STEPS.forEach((s, i) => {
  if (!SERVERS[s.host]) throw new Error(`Paso ${i}: host desconocido ${s.host}`);
  if (!PHASES.find((p) => p.id === s.phase)) throw new Error(`Paso ${i}: fase desconocida ${s.phase}`);
});

module.exports = { SERVERS, PHASES, STEPS, LOGIN };
