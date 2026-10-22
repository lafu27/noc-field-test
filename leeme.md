# NOC Field Test

Simulador de **prueba de campo de mantenimiento de servidores remotos**, todo desde el navegador.
Se ve como una sala NOC (paneles de métricas en vivo, mapa de red, alertas, log agregado y una terminal SSH) y se comporta de forma realista, pero **es 100 % simulado**: no se conecta a ningún servidor ni ejecuta nada en tu máquina. Las IP son de rangos reservados para documentación.

Escenario: ventana de mantenimiento **MW-2026-1022** de 30 minutos. Parchear la capa web (con reinicios por kernel), resolver un disco lleno en la base de datos, probar una restauración de backup real y cerrar hallazgos de seguridad (fuerza bruta SSH, puerto 3306 expuesto, certificado por vencer).

- ~60 comandos reales de sysadmin (`apt`, `systemctl`, `journalctl`, `pg_restore`, `ufw`, `fail2ban`, `certbot`, `ssh`, …).
- El comando exacto del paso actual aparece **en letra muy chica** abajo a la derecha. Vos lo tipeás; para quien mira parece que sabés de memoria qué hacer.
- Salidas con ritmo (descargas, reinicios, `ping` esperando que vuelva el host).
- Pantalla final con el tiempo total y un reporte descargable.

---

## 1. Instalación en una computadora nueva (desde cero)

Repositorio: **<https://github.com/lafu27/noc-field-test>**

Lo único que *necesitás sí o sí* es **Node.js** (hace andar el servidor). **Git no hace falta**: podés bajar el proyecto como .zip.

### Paso 1 · Instalar Node.js

1. Entrá a <https://nodejs.org> y descargá la versión **LTS** (botón verde).
2. Abrí el instalador y aceptá todo con *Next* (dejá tildada la opción “Add to PATH” si aparece).
3. **Cerrá y volvé a abrir** cualquier terminal que tuvieras abierta.
4. Comprobá que quedó instalado. Abrí una terminal (en Windows: tecla Windows → escribí `cmd` → Enter) y escribí:

```bash
node -v
npm -v
```
Tienen que mostrar números de versión (Node 18 o más). Si dice “no se reconoce el comando”, reiniciá la PC y probá de nuevo.

Alternativa en Windows 10/11, sin navegador, desde la terminal:
```bash
winget install OpenJS.NodeJS.LTS
```

### Paso 2 · Bajar el proyecto (elegí UNA opción)

**Opción A · Sin Git (la más fácil)**
1. Abrí <https://github.com/lafu27/noc-field-test>.
2. Botón verde **Code** → **Download ZIP**.
3. Clic derecho sobre el .zip → **Extraer todo…** (en Mac/Linux: doble clic o `unzip`).
4. Vas a tener una carpeta `noc-field-test-main`. Entrá hasta ver adentro `package.json` y `server.js`.

**Opción B · Con Git**
1. Instalá Git desde <https://git-scm.com/downloads> (todo *Next*) o con `winget install Git.Git`. Reabrí la terminal.
2. Corré:
```bash
git clone https://github.com/lafu27/noc-field-test.git
cd noc-field-test
```

### Paso 3 · Instalar dependencias y arrancar

Abrí una terminal **dentro de la carpeta del proyecto**. En Windows: abrí la carpeta en el Explorador, hacé clic en la barra de direcciones, escribí `cmd` y Enter. Después:

```bash
npm install
npm start
```

Cuando muestre `NOC Field Test escuchando en http://localhost:3000`, abrí esa dirección en el navegador. **Dejá la terminal abierta** mientras lo usás; para apagarlo, `Ctrl + C`.

La próxima vez alcanza con `npm start` (o doble clic en `iniciar.bat` en Windows).

### Atajo para Windows: `iniciar.bat`
Doble clic en `iniciar.bat`: verifica que Node esté instalado, instala las dependencias la primera vez, abre el navegador y levanta el servidor.

### Si se actualiza el repo y querés la última versión
- Con Git: `git pull` y luego `npm install`.
- Sin Git: volvé a bajar el ZIP y reemplazá la carpeta.

### Cambiar el puerto
```bash
# Linux / macOS
PORT=4000 npm start
# Windows PowerShell
$env:PORT=4000; npm start
# Windows CMD
set PORT=4000 && npm start
```

### Requisitos
| Herramienta | Versión | Obligatoria |
|-------------|---------|-------------|
| **Node.js** | 18 o superior (LTS) | Sí |
| **Git** | cualquiera | No (solo para clonar / subir cambios) |
| Navegador | Chrome, Edge, Firefox o Safari actual | Sí |
| Internet | solo en `npm install` (baja Express) | Primera vez |

---

## 2. Cómo se usa

1. Entrás a la página y leés el briefing. Apretás **INICIAR VENTANA** (arranca el reloj de 30:00).
2. Mirá **OBJETIVO** (arriba de la terminal): te dice *qué* hacer en ese paso.
3. Mirá la esquina inferior derecha: ahí está el *comando exacto*, muy chico y apagado. Pasá el mouse para agrandarlo, clic para copiarlo.
4. Tipeá el comando en la terminal y apretá **Enter**. Si el paso es en otro servidor, primero te pide `ssh ops@host`.
5. Leé la salida (los datos clave están en [`GUIA.md`](GUIA.md) → columna “Qué mirar”) y seguí con el siguiente paso.
6. Al terminar aparece el tiempo total y un reporte `.md` descargable.

### Controles
| Tecla | Acción |
|-------|--------|
| **Tab** | autocompleta el comando de la pista si ya escribiste el comienzo (como Tab de bash) |
| **↑ / ↓** | historial de comandos |
| **Ctrl + L** | limpiar pantalla |
| **Ctrl + C** | cortar una salida que se está imprimiendo |
| **Esc** | ocultar / mostrar la pista |
| Clic en la pista | copiar el comando |

### Parámetros de URL (opcionales)
| URL | Efecto |
|-----|--------|
| `?hint=off` | oculta la pista desde el inicio (modo experto) |
| `?hint=big` | pista más grande y visible |
| `?tab=off` | desactiva el autocompletado con Tab |


Podés recargar la página: la partida se conserva (el historial de pantalla de la terminal no).
Para empezar de cero: **Jugar de nuevo** en la pantalla final, o borrar la clave `noc_sid` del almacenamiento local del navegador.

---

## 3. Guía de la sesión (30 min)

[`GUIA.md`](GUIA.md) contiene el guion completo: fases, tiempos estimados, cada comando y qué cifras mirar. Se genera desde el escenario, así que si lo editás podés regenerarla:

```bash
npm run guia
```

---

## 4. Subir cambios al repo de GitHub

El repo ya existe: <https://github.com/lafu27/noc-field-test>. Para subir cambios necesitás Git instalado (ver Paso 2 · Opción B) y haber clonado el repo.

### Primera vez usando Git en esa PC
```bash
git config --global user.name  "Tu Nombre"
git config --global user.email "tu@correo.com"
```

### Subir cambios
```bash
git add .
git commit -m "Describí el cambio"
git push
```

Al hacer `push`, Git te pide autenticarte. GitHub ya no acepta la contraseña de la cuenta: en Windows se abre una ventana de login del navegador (Git Credential Manager) y alcanza con iniciar sesión. Si te pide “password” en la terminal, usá un **Personal Access Token** (GitHub → Settings → Developer settings → Personal access tokens, con permiso `repo`).

### Si todavía no está subido el código (repo vacío)
En una terminal dentro de la carpeta del proyecto:
```bash
git init
git add .
git commit -m "NOC Field Test: versión inicial"
git branch -M main
git remote add origin https://github.com/lafu27/noc-field-test.git
git push -u origin main
```

> `node_modules/` está en `.gitignore`: no se sube. Quien baje el repo corre `npm install` y listo.

### ¿Se puede publicar en GitHub Pages?
No tal cual: Pages sirve solo archivos estáticos y este proyecto necesita el servidor Node (el motor de comandos está en `src/engine.js`). Para tenerlo online podés usar un hosting que corra Node (Render, Railway, Fly.io, un VPS…) con comando de inicio `npm start`; usa la variable `PORT` que le da el hosting.

---

## 5. Probar que todo anda

```bash
npm test
```
Juega la partida completa contra el motor (con errores a propósito, reinicios y `ssh` rechazado mientras un host reinicia) y verifica que termine y genere el reporte. No necesita red.

---

## 6. Personalizar el escenario

Todo el contenido está en [`src/scenario.js`](src/scenario.js):
- `SERVERS`: hosts, IP, rol y métricas base.
- `PHASES`: fases del plan.
- `STEPS`: cada paso (`host`, `cmd`, `objective`, `out`, efectos sobre métricas/alertas).

Formato de las líneas de salida:

| Marca | Efecto |
|-------|--------|
| `"@800 texto"` | espera 800 ms antes de mostrar la línea |
| `"!ok texto"` | verde (`!warn` ámbar, `!err` rojo, `!dim` gris, `!cy` cian) |
| `"abc !err xyz"` | colorea desde la marca hasta el final de la línea |

Después de editar: `npm test` y `npm run guia`.

### Estructura
```
noc-field-test/
├── server.js            # Express: rutas /api/*
├── src/
│   ├── engine.js        # motor de la simulación (sin dependencias)
│   └── scenario.js      # servidores, fases y los ~51 pasos
├── public/              # interfaz (index.html, style.css, app.js)
├── scripts/
│   ├── make-guide.js    # genera GUIA.md
│   └── playthrough.js   # prueba automática
├── iniciar.bat          # atajo para Windows
├── GUIA.md
└── README.md
```

---

## 7. Problemas frecuentes

| Síntoma | Solución |
|---------|----------|
| `npm`/`node` “no se reconoce” | Instalá Node.js (Paso 1) y reabrí la terminal o reiniciá la PC |
| `npm install` falla por red | Revisá la conexión; detrás de un proxy de empresa hay que configurarlo (`npm config set proxy ...`) |
| `package.json not found` | Estás en la carpeta equivocada; entrá a la que tiene `package.json` adentro |
| `EADDRINUSE` (puerto ocupado) | Usá otro puerto: `PORT=4000 npm start` |
| La página carga pero no responde | Verificá que `npm start` siga corriendo y entrá a la misma URL/puerto |
| `Esta tarea corresponde a X` | Estás en otro host: `ssh ops@X` |
| `ssh: ... Connection refused` | El host se está reiniciando; usá el `ping` del paso y esperá |
| No veo la pista | Apretá **Esc** (puede estar oculta) o abrí `?hint=big` |
