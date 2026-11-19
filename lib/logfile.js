'use strict';
// The server log is written by redirecting a detached process's stdout/stderr into the file, so it
// can only be rotated between runs: once at most MAX_BYTES it moves to "<file>.1" (one generation).

const fs = require('node:fs');

const MAX_BYTES = 1024 * 1024;

function rotateIfLarge(file, maxBytes = MAX_BYTES) {
  try {
    if (fs.statSync(file).size <= maxBytes) return false;
    fs.renameSync(file, `${file}.1`); // overwrites the previous generation
    return true;
  } catch {
    return false; // missing file, or the log is optional anyway
  }
}

module.exports = { rotateIfLarge, MAX_BYTES };
