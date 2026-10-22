# Guía de la ventana MW-2026-1022 (≈ 30 min)

> Esta guía es el “guion” completo de la prueba de campo. Está **generada automáticamente** desde `src/scenario.js` (`npm run guia`).
> Los tiempos son una estimación de ritmo cómodo; el simulador en sí no te apura salvo por el reloj de 30:00.

## Resumen

- **Pasos con comando:** 60 (9 de ellos son `ssh` entre hosts)
- **Duración estimada:** 29:00 hasta el último comando (cierre de ventana ≈ 29:00–30:00, ritmo objetivo)
- **Hosts:** `bastion` (10.20.0.2), `edge-fw` (10.20.0.1), `web-01` (10.20.0.11), `web-02` (10.20.0.12), `db-01` (10.20.0.21), `bak-01` (10.20.0.31)

## Cómo usar esta guía

1. Abrí el simulador (`npm start` → http://localhost:3000) y apretá **INICIAR VENTANA**.
2. La esquina inferior derecha muestra, en letra muy chica, el comando exacto del paso actual. Esta guía lo anticipa.
3. Cuando el paso es en otro host, primero tenés que hacer `ssh` (la pista lo muestra solo).
4. La columna **Qué mirar** son los datos que conviene leer en pantalla antes de seguir (cantidades, porcentajes, estados).

## P1 · Apertura y reconocimiento  `00:00 – 02:33`

Abrir la ventana de cambios y revisar el estado base de web-01.

| T+ aprox. | Host | Comando | Qué mirar |
|-----------|------|---------|-----------|
| 00:40 | `bastion` | `sudo /opt/ops/mw open MW-2026-1022` | Ventana 03:00–03:30, 5 hosts en alcance, aprobadores M. Ferreyra y L. Quiroga. |
| 00:56 | `web-01` | `ssh ops@web-01` | Salto a web-01 (10.20.0.11). |
| 01:19 | `web-01` | `uptime` | Uptime 41 días, load average ~0.5: el servidor está sano. |
| 01:42 | `web-01` | `df -h` | / al 58 % (27G usados, 20G libres): alcanza de sobra. |
| 02:04 | `web-01` | `free -m` | 7937 MB totales, 4411 MB disponibles, swap casi sin uso (12 MB). |
| 02:33 | `web-01` | `systemctl status nginx --no-pager` | active (running) desde hace 41 días; 3 workers. |

## P2 · Parcheo web-01  `02:33 – 06:41`

Actualizar paquetes, reiniciar por kernel y validar el servicio.

| T+ aprox. | Host | Comando | Qué mirar |
|-----------|------|---------|-----------|
| 03:06 | `web-01` | `sudo apt update` | Resultado clave: 47 paquetes actualizables. |
| 03:40 | `web-01` | `apt list --upgradable 2>/dev/null \| head -n 10` | Entre ellos hay kernel nuevo (5.15.0-126): vamos a necesitar reinicio. |
| 04:42 | `web-01` | `sudo apt upgrade -y` | Descarga de 189 MB; al final avisa “Pending kernel upgrade”. |
| 04:59 | `web-01` | `cat /var/run/reboot-required` | Pide reinicio por el kernel nuevo. |
| 05:16 | `web-01` | `sudo reboot` | La conexión SSH se corta; el servidor queda en REINICIANDO unos segundos. |
| 05:45 | `bastion` | `ping -c 4 web-01` | Primero “Destination Host Unreachable”, después responde (~0.4 ms). |
| 06:02 | `web-01` | `ssh ops@web-01` | Salto a web-01 (10.20.0.11). |
| 06:19 | `web-01` | `uname -r` | Debe decir 5.15.0-126-generic. |
| 06:41 | `web-01` | `systemctl is-active nginx` | Responde “active”. |

## P3 · Parcheo web-02  `06:41 – 09:42`

Repetir el procedimiento en el segundo nodo web (rolling).

| T+ aprox. | Host | Comando | Qué mirar |
|-----------|------|---------|-----------|
| 06:58 | `web-02` | `ssh ops@web-02` | Salto a web-02 (10.20.0.12). |
| 08:00 | `web-02` | `sudo apt update && sudo apt upgrade -y` | Misma lista de 47 paquetes; vuelve a pedir reinicio. |
| 08:17 | `web-02` | `sudo reboot` | Es seguro porque web-01 ya está parcheado y de vuelta en el pool. |
| 08:45 | `bastion` | `ping -c 4 web-02` | Misma secuencia: unreachable y después respuesta. |
| 09:02 | `web-02` | `ssh ops@web-02` | Salto a web-02 (10.20.0.12). |
| 09:19 | `web-02` | `uname -r` | 5.15.0-126-generic. |
| 09:42 | `web-02` | `curl -sI http://localhost \| head -n 1` | HTTP/1.1 200 OK. |

## P4 · Incidente en db-01  `09:42 – 16:17`

Disco al 91 %: encontrar la causa, corregir y liberar espacio.

| T+ aprox. | Host | Comando | Qué mirar |
|-----------|------|---------|-----------|
| 09:59 | `db-01` | `ssh ops@db-01` | Salto a db-01 (10.20.0.21). |
| 10:27 | `db-01` | `df -h` | / está al 91 % (89G de 98G). El volumen de datos de Postgres está bien (60 %). |
| 11:01 | `db-01` | `sudo du -sh /var/log/* \| sort -h \| tail -n 5` | Sospechoso: /var/log/app-debug con 61G. |
| 11:29 | `db-01` | `sudo ls -lh /var/log/app-debug \| head -n 8` | Un log de ~9 GB por día desde el 14/10: alguien dejó el modo DEBUG. |
| 12:14 | `db-01` | `sudo journalctl -u postgresql --since "1 hour ago" --no-pager \| tail -n 8` | Consultas lentas y checkpoints demorados por presión de I/O; todavía sin errores fatales. |
| 12:43 | `db-01` | `sudo systemctl status legacy-etl --no-pager` | legacy-etl corre con LOG_LEVEL=DEBUG. |
| 13:22 | `db-01` | `sudo sed -i 's/LOG_LEVEL=DEBUG/LOG_LEVEL=INFO/' /etc/legacy-etl/etl.env` | No imprime nada: sed -i edita el archivo en el lugar. |
| 13:45 | `db-01` | `sudo systemctl restart legacy-etl` | Tampoco imprime nada si sale bien. |
| 14:19 | `db-01` | `sudo find /var/log/app-debug -name "*.log" -mtime +1 -delete` | Libera ~55 GB. El de hoy queda intacto por el -mtime +1. |
| 14:47 | `db-01` | `sudo journalctl --vacuum-size=500M` | Libera ~3.3 GB de journals archivados. |
| 15:15 | `db-01` | `df -h` | / bajó del 91 % al 63 %. |
| 15:55 | `db-01` | `sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity;"` | 23 conexiones: normal. |
| 16:17 | `db-01` | `sudo pg_lsclusters` | Cluster 14/main online. |

## P5 · Verificación de backups  `16:17 – 21:11`

Validar integridad y probar una restauración real en bak-01.

| T+ aprox. | Host | Comando | Qué mirar |
|-----------|------|---------|-----------|
| 16:34 | `bak-01` | `ssh ops@bak-01` | Salto a bak-01 (10.20.0.31). |
| 17:03 | `bak-01` | `ls -lh /backups/daily` | Hay un dump de ~13 GB por día; el del 21/10 es el último. |
| 17:42 | `bak-01` | `sudo sha256sum -c /backups/daily/db-01_2026-10-22.sha256` | Tarda unos segundos (13 GB) y debe decir OK. |
| 18:22 | `bak-01` | `sudo -u postgres pg_restore --list /backups/daily/db-01_2026-10-22.dump \| head -n 12` | Muestra formato custom, base “shop”, versión 14.13. |
| 18:44 | `bak-01` | `sudo -u postgres createdb restore_test` | No imprime nada si sale bien. |
| 19:46 | `bak-01` | `sudo -u postgres pg_restore -v -d restore_test /backups/daily/db-01_2026-10-22.dump` | Salida larga en modo verbose; termina sin errores. |
| 20:26 | `bak-01` | `sudo -u postgres psql -d restore_test -c "SELECT count(*) FROM orders;"` | 18.422.917 pedidos: coincide con producción (±0.1 %). |
| 20:49 | `bak-01` | `sudo -u postgres dropdb restore_test` | Limpieza obligatoria: libera ~14 GB. |
| 21:11 | `bak-01` | `cat /etc/cron.d/backup-rotate` | Rotación diaria a las 02:30, retención de 14 días. |

## P6 · Seguridad y red  `21:11 – 27:24`

Fuerza bruta SSH, puerto 3306 expuesto y certificado por vencer.

| T+ aprox. | Host | Comando | Qué mirar |
|-----------|------|---------|-----------|
| 21:28 | `edge-fw` | `ssh ops@edge-fw` | Salto a edge-fw (10.20.0.1). |
| 21:56 | `edge-fw` | `sudo grep -c "Failed password" /var/log/auth.log` | 1912 intentos fallidos en el log actual. |
| 22:47 | `edge-fw` | `sudo awk '/Failed password/ {print $(NF-3)}' /var/log/auth.log \| sort \| uniq -c \| sort -rn \| head -n 5` | 203.0.113.45 hace 1.684 de los 1.912 intentos. |
| 23:15 | `edge-fw` | `sudo fail2ban-client status sshd` | El jail está activo pero la IP atacante aún no está baneada. |
| 23:44 | `edge-fw` | `sudo fail2ban-client set sshd banip 203.0.113.45` | Devuelve 1 (una IP baneada). |
| 24:12 | `edge-fw` | `sudo ufw status numbered` | La regla [5] deja 3306/tcp (MySQL/MariaDB) abierta a Anywhere: no corresponde. |
| 24:34 | `edge-fw` | `sudo ufw --force delete 5` | Confirma “Rule deleted”. |
| 24:57 | `edge-fw` | `sudo ufw status numbered` | Ahora hay 6 reglas y ninguna con 3306. |
| 25:14 | `web-01` | `ssh ops@web-01` | Salto a web-01 (10.20.0.11). |
| 25:42 | `web-01` | `sudo certbot certificates` | El certificado vence en 6 días (VALID: 6 days): hay que renovar. |
| 26:22 | `web-01` | `sudo certbot renew --force-renewal` | Debe terminar con “Congratulations, all renewals succeeded”. |
| 26:39 | `web-01` | `sudo nginx -s reload` | Sin salida si todo va bien. |
| 27:24 | `web-01` | `echo \| openssl s_client -connect localhost:443 2>/dev/null \| openssl x509 -noout -enddate` | Ahora vence en enero de 2027. |

## P7 · Cierre de ventana  `27:24 – 29:00`

Verificar todo y cerrar el ticket con el reporte final.

| T+ aprox. | Host | Comando | Qué mirar |
|-----------|------|---------|-----------|
| 27:41 | `bastion` | `ssh ops@bastion` | Salto a bastion (10.20.0.2). |
| 28:26 | `bastion` | `sudo /opt/ops/mw verify MW-2026-1022` | Tabla con 5 hosts en OK. |
| 29:00 | `bastion` | `sudo /opt/ops/mw close MW-2026-1022 --report` | Cierra el ticket y notifica a #ops-guardia. |

## Cifras clave para recordar

| Dato | Valor |
|------|-------|
| Paquetes actualizables en web-01/web-02 | 47 (44 actualizados + 3 nuevos) |
| Kernel antes → después | 5.15.0-122 → 5.15.0-126 |
| db-01 disco `/` | 91 % → 63 % |
| Causa raíz del incidente | `legacy-etl` con `LOG_LEVEL=DEBUG` (≈ 9 GB/día) |
| Backup verificado | `db-01_2026-10-22.dump` (13 GB) → 18.422.917 filas en `orders` |
| Intentos SSH fallidos | 1.912 (1.684 desde 203.0.113.45) |
| Puerto expuesto | 3306/tcp (regla nº 5 de ufw) |
| Certificado TLS | vence en 6 días → renovado hasta 20/01/2027 |

## Si te trabás

- **“command not found” o “argumentos inválidos”:** revisá espacios y comillas.
- **“Esta tarea corresponde a X”:** estás en otro host; hacé `ssh ops@X`.
- **“Connection refused” al hacer ssh:** el host se está reiniciando; esperá y usá `ping` desde el bastión.
- **Tab** completa el comando de la pista si ya escribiste el comienzo. **Esc** oculta/muestra la pista.
