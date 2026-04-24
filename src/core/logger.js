'use strict';

const fs = require('node:fs');
const path = require('node:path');

const LEVEL_ORDER = { error: 0, warn: 1, info: 2, debug: 3 };

function writeStream(streamOrNull, line) {
  if (!streamOrNull) return;
  try { streamOrNull.write(line + '\n'); }
  catch {}
}

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

function fileSize(p) {
  try { return fs.statSync(p).size; }
  catch { return 0; }
}

function rotate(filePath, keep) {
  for (let i = keep - 1; i >= 1; i -= 1) {
    const from = `${filePath}.${i}`;
    const to = `${filePath}.${i + 1}`;
    try { fs.renameSync(from, to); } catch {}
  }
  try { fs.renameSync(filePath, `${filePath}.1`); } catch {}
}

class RotatingJsonLogger {
  constructor({
    filePath,
    level = 'info',
    maxFileSize = 5 * 1024 * 1024,
    keep = 5,
    stderr = process.stderr,
    peer = null,
  } = {}) {
    this.level = LEVEL_ORDER[level] ?? LEVEL_ORDER.info;
    this.filePath = filePath || null;
    this.maxFileSize = maxFileSize;
    this.keep = keep;
    this.stderr = stderr;
    this.peer = peer;
    if (this.filePath) ensureDir(this.filePath);
  }

  _emit(level, evt, data) {
    if ((LEVEL_ORDER[level] ?? 99) > this.level) return;
    const rec = {
      ts: new Date().toISOString(),
      level,
      evt,
      peer: this.peer,
      ...(data && typeof data === 'object' ? { data: sanitise(data) } : { data }),
    };
    const line = JSON.stringify(rec);
    writeStream(this.stderr, line);
    this._writeToFile(line);
  }

  _writeToFile(line) {
    if (!this.filePath) return;
    try { fs.appendFileSync(this.filePath, line + '\n'); }
    catch {}
    if (this.maxFileSize > 0 && fileSize(this.filePath) > this.maxFileSize) {
      rotate(this.filePath, this.keep);
    }
  }

  info(evt, data) { this._emit('info', evt, data); }
  warn(evt, data) { this._emit('warn', evt, data); }
  error(evt, data) {
    const norm = data instanceof Error ? { message: data.message, stack: data.stack } : data;
    this._emit('error', evt, norm);
  }
  debug(evt, data) { this._emit('debug', evt, data); }

  close() {
    // No-op — sync append means nothing to flush or close.
  }
}

function sanitise(obj) {
  if (Array.isArray(obj)) return obj.map(sanitise);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'raw' || k === 'cmb') continue;
      out[k] = sanitise(v);
    }
    return out;
  }
  return obj;
}

module.exports = { RotatingJsonLogger, LEVEL_ORDER, sanitise };
