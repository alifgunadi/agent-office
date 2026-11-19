'use strict';
// Everything here treats the payload as untrusted: only known fields survive, every one is
// type-checked and length-capped, so later code never sees a number where it expects a string.

const MAX_ID_LEN = 64;
const MAX_REF_LEN = 128; // session_id, agent_id, tool_name
const BANNED_IDS = new Set(['__proto__', 'constructor', 'prototype']);

function cleanString(value, max) {
  return typeof value === 'string' && value ? value.slice(0, max) : undefined;
}

// Desk ids: nested ids ("engineering/lead-dba") flatten to the basename, odd characters are dropped.
function cleanId(value) {
  const raw = cleanString(value, 256);
  if (!raw) return undefined;
  const base = raw.split(/[\\/]/).pop().replace(/[^\p{L}\p{N}_.:@ -]/gu, '').trim().slice(0, MAX_ID_LEN);
  return base && !BANNED_IDS.has(base) ? base : undefined;
}

function cleanToolInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const out = {};
  const file = cleanString(input.file_path, 300);
  if (file) out.file_path = file;
  const command = cleanString(input.command, 400);
  if (command) out.command = command.trim().split(/\s+/)[0].slice(0, 40);
  const pattern = cleanString(input.pattern, 40);
  if (pattern) out.pattern = pattern;
  const subagent = cleanId(input.subagent_type);
  if (subagent) out.subagent_type = subagent;
  return out;
}

// Envelope v1 (additive): senders may add `v` (schema version) and `source` (which agent product
// sent the event). Senders that predate the envelope send neither and are treated as Claude Code v1.
const DEFAULT_SOURCE = 'claude-code';
const MAX_SOURCE_LEN = 32;

function cleanVersion(value) {
  return Number.isInteger(value) && value >= 1 && value <= 999 ? value : 1;
}

function cleanSource(value) {
  const id = cleanId(value);
  return id ? id.slice(0, MAX_SOURCE_LEN) : DEFAULT_SOURCE;
}

// Returns null when the payload is not an event at all.
function sanitizeEvent(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const name = cleanString(raw.hook_event_name, MAX_ID_LEN);
  if (!name) return null;
  return {
    v: cleanVersion(raw.v),
    source: cleanSource(raw.source),
    hook_event_name: name,
    session_id: cleanString(raw.session_id, MAX_REF_LEN),
    agent_id: cleanString(raw.agent_id, MAX_REF_LEN),
    agent_type: cleanId(raw.agent_type),
    teammate_name: cleanId(raw.teammate_name),
    tool_name: cleanString(raw.tool_name, MAX_REF_LEN),
    notification_type: cleanString(raw.notification_type, MAX_ID_LEN),
    tool_input: cleanToolInput(raw.tool_input),
  };
}

module.exports = { sanitizeEvent, cleanId, cleanString, MAX_ID_LEN, MAX_REF_LEN, DEFAULT_SOURCE };
