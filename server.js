'use strict';
/**
 * NOC Field Test — servidor Express (capa fina sobre src/engine.js).
 * Todo es simulado: no ejecuta nada real en tu máquina ni en la red.
 */
const express = require('express');
const path = require('path');
const { createEngine } = require('./src/engine');

const PORT = process.env.PORT || 3000;
const engine = createEngine();

const app = express();
app.use(express.json({ limit: '16kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/state', (req, res) => res.json(engine.state(req.query.sid)));
app.post('/api/start', (req, res) => res.json(engine.start(req.body && req.body.sid)));
app.post('/api/reset', (req, res) => res.json(engine.reset(req.body && req.body.sid)));
app.post('/api/exec', (req, res) => res.json(engine.exec(req.body && req.body.sid, req.body && req.body.cmd)));
app.get('/api/report', (req, res) => {
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="MW-2026-1022-reporte.md"');
  res.send(engine.report(req.query.sid));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n  NOC Field Test escuchando en  http://localhost:${PORT}`);
    console.log('  (simulación: no se conecta a ningún servidor real)\n');
  });
}

module.exports = app;
