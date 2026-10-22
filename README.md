# NOC Field Test

Simulador de **prueba de campo de mantenimiento de servidores remotos**, todo desde el navegador.
Se ve como una sala NOC (paneles de métricas en vivo, mapa de red, alertas, log agregado y una terminal SSH) y se comporta de forma realista, pero **es 100 % simulado**: no se conecta a ningún servidor ni ejecuta nada en tu máquina. Las IP son de rangos reservados para documentación.

Escenario: ventana de mantenimiento **MW-2026-1022** de 30 minutos. Parchear la capa web (con reinicios por kernel), resolver un disco lleno en la base de datos, probar una restauración de backup real y cerrar hallazgos de seguridad (fuerza bruta SSH, puerto 3306 expuesto, certificado por vencer).

- ~60 comandos reales de sysadmin (`apt`, `systemctl`, `journalctl`, `pg_restore`, `ufw`, `fail2ban`, `certbot`, `ssh`, …).
- El comando exacto del paso actual aparece **en letra muy chica** abajo a la derecha. Vos lo tipeás; para quien mira parece que sabés de memoria qué hacer.
- Salidas con ritmo (descargas, reinicios, `ping` esperando que vuelva el host).
- Puntaje, rango (S/A/B/C) y reporte final descargable.

---

## 1. Instalación en una computadora nueva

### Requisitos
| Herramienta | Versión | Para qué |
|-------------|---------|----------|
| **Node.js** | 18 o superior (recomendado LTS) | correr el servidor |
| **Git** | cualquiera | clonar / subir a GitHub |
| Navegador | Chrome, Edge, Firefox o Safari actual | usar el simulador |

Instalar Node.js: <https://nodejs.org> (descargar “LTS”). Instalar Git: <https://git-scm.com/downloads>.
Verificá en una terminal:

```bash
node -v    # v18 o más
npm -v
git --version
```

### Pasos

**Si el proyecto ya está en GitHub:**
```bash
git clone https://github.com/TU_USUARIO/noc-field-test.git
cd noc-field-test
npm install
npm start
```

**Si lo tenés como carpeta / .zip:** descomprimí, abrí una terminal dentro de la carpeta `noc-field-test` y corré:
```bash
npm install
npm start
```

Después abrí **<http://localhost:3000>** en el navegador.

Cambiar el puerto:
```bash
# Linux / macOS
PORT=4000 npm start
# Windows PowerShell
$env:PORT=4000; npm start
# Windows CMD
set PORT=4000 && npm start
```

---

## 2. Cómo se usa

1. Entrás a la página y leés el briefing. Apretás **INICIAR VENTANA** (arranca el reloj de 30:00).
2. Mirá **OBJETIVO** (arriba de la terminal): te dice *qué* hacer en ese paso.
3. Mirá la esquina inferior derecha: ahí está el *comando exacto*, muy chico y apagado. Pasá el mouse para agrandarlo, clic para copiarlo.
4. Tipeá el comando en la terminal y apretá **Enter**. Si el paso es en otro servidor, primero te pide `ssh ops@host`.
5. Leé la salida (los datos clave están en [`GUIA.md`](GUIA.md) → columna “Qué mirar”) y seguí con el siguiente paso.
6. Al terminar aparece tu puntaje, tiempo y un reporte `.md` descargable.

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

### Puntaje
- 100 puntos por paso completado.
- Bono de hasta 900 puntos según el tiempo que te sobre de los 30 minutos.
- −20 puntos por error (comando inexistente, argumentos mal escritos, comando en el host equivocado).
- Rango: S ≥ 90 %, A ≥ 75 %, B ≥ 60 %, C resto.

Podés recargar la página: la partida se conserva (el historial de pantalla de la terminal no).
Para empezar de cero: **Jugar de nuevo** en la pantalla final, o borrar la clave `noc_sid` del almacenamiento local del navegador.

---

## 3. Guía de la sesión (30 min)

[`GUIA.md`](GUIA.md) contiene el guion completo: fases, tiempos estimados, cada comando y qué cifras mirar. Se genera desde el escenario, así que si lo editás podés regenerarla:

```bash
npm run guia
```

---

## 4. Subir el repo a GitHub

### Opción A: con la web de GitHub (la más simple)
1. Creá una cuenta en <https://github.com> si no tenés.
2. **New repository** → nombre `noc-field-test` → **sin** README ni .gitignore (ya vienen en el proyecto) → **Create repository**.
3. En una terminal dentro de la carpeta del proyecto:

```bash
git init
git add .
git commit -m "NOC Field Test: versión inicial"
git branch -M main
git remote add origin https://github.com/lafu27/noc-field-test
git push -u origin main
```

Al hacer `push`, Git te pide autenticarte. GitHub ya no acepta la contraseña de la cuenta: usá un **Personal Access Token** (Settings → Developer settings → Personal access tokens → permiso `repo`) como contraseña, o configurá **SSH** (`git remote add origin git@github.com:TU_USUARIO/noc-field-test.git`).

### Opción B: con GitHub CLI (`gh`)
```bash
gh auth login
git init && git add . && git commit -m "NOC Field Test: versión inicial"
gh repo create noc-field-test --public --source=. --remote=origin --push
```

### Primera vez usando Git en esa PC
```bash
git config --global user.name  "Tu Nombre"
git config --global user.email "tu@correo.com"
```

### Para subir cambios después
```bash
git add .
git commit -m "Describí el cambio"
git push
```

> `node_modules/` está en `.gitignore`: no se sube. Quien clone el repo corre `npm install` y listo.

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
├── GUIA.md
└── README.md
```

---

## 7. Problemas frecuentes

| Síntoma | Solución |
|---------|----------|
| `npm: command not found` | Instalá Node.js y reabrí la terminal |
| `EADDRINUSE` (puerto ocupado) | Usá otro puerto: `PORT=4000 npm start` |
| La página carga pero no responde | Verificá que `npm start` siga corriendo y entrá a la misma URL/puerto |
| `Esta tarea corresponde a X` | Estás en otro host: `ssh ops@X` |
| `ssh: ... Connection refused` | El host se está reiniciando; usá el `ping` del paso y esperá |
| No veo la pista | Apretá **Esc** (puede estar oculta) o abrí `?hint=big` |


(async () => {
  const N = 300;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const hechas = new Set();
  const log = [];
  let sinCambios = 0;
  let motivo = '';

  const idDe = box => {
    let el = box;
    while (el && el !== document.body) {
      const a = el.querySelector('a[href*="/photo/"]');
      if (a) return a.getAttribute('href');
      el = el.parentElement;
    }
    return null;
  };

  // Busca el contenedor que realmente scrollea
  const primera = document.querySelector('div[role="checkbox"]');
  let scroller = window;
  let el = primera;
  while (el && el !== document.body) {
    const s = getComputedStyle(el);
    if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight) { scroller = el; break; }
    el = el.parentElement;
  }
  console.log('Contenedor de scroll:', scroller === window ? 'window' : scroller);

  const scrollear = () => {
    if (scroller === window) window.scrollBy(0, window.innerHeight * 0.8);
    else scroller.scrollTop += scroller.clientHeight * 0.8;
  };
  const posicion = () => scroller === window ? window.scrollY : scroller.scrollTop;

  let vuelta = 0;
  while (hechas.size < N) {
    vuelta++;
    const antes = hechas.size;
    const boxes = [...document.querySelectorAll('div[role="checkbox"]')];
    let sinId = 0, yaHechas = 0, clickeadas = 0, noMarco = 0;

    for (const box of boxes) {
      if (hechas.size >= N) break;
      const id = idDe(box);
      if (!id) { sinId++; continue; }
      if (hechas.has(id)) { yaHechas++; continue; }
      hechas.add(id);
      if (box.getAttribute('aria-checked') !== 'true') {
        box.click();
        clickeadas++;
        await sleep(80);
        if (box.getAttribute('aria-checked') !== 'true') noMarco++;
      }
    }

    const pos0 = posicion();
    scrollear();
    await sleep(1500);
    const pos1 = posicion();

    log.push({ vuelta, casillas: boxes.length, sinId, yaHechas, clickeadas, noMarco, total: hechas.size, scrollAntes: Math.round(pos0), scrollDespues: Math.round(pos1) });

    sinCambios = hechas.size === antes ? sinCambios + 1 : 0;
    if (sinCambios >= 6) { motivo = 'No aparecieron fotos nuevas en 6 vueltas seguidas'; break; }
    if (vuelta > 200) { motivo = 'Límite de 200 vueltas'; break; }
  }
  if (!motivo) motivo = 'Llegó a ' + N;

  console.table(log);
  console.log('Motivo de corte:', motivo, '| Total registradas:', hechas.size);
  console.log('Marcadas visibles ahora:', document.querySelectorAll('div[role="checkbox"][aria-checked="true"]').length);
})();