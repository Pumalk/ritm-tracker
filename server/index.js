'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { initDb } = require('./db');
const { syncRouter } = require('./sync');
const { healthRoute } = require('./routes');

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '127.0.0.1';

const app = express();
app.use(express.json({ limit: '1mb' }));

const db = initDb();
app.use('/api', healthRoute(db));
app.use('/api', syncRouter(db));
app.use(express.static(path.join(__dirname, '..', 'public')));

http
  .createServer(app)
  .listen(PORT, HOST, () => {
    console.log(`Ритм запущен: http://${HOST}:${PORT}`);
    console.log('HTTP без шифрования: используйте только в доверенной домашней сети.');
  });
