'use strict';

const express = require('express');

function healthRoute(db) {
  const router = express.Router();
  router.get('/health', (req, res) => {
    const row = db.prepare('SELECT COALESCE(MAX(rev), 0) AS rev FROM changes').get();
    res.json({ ok: true, rev: row.rev });
  });
  return router;
}

module.exports = { healthRoute };
