'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeEvent, cleanId } = require('../lib/sanitize');

describe('sanitizeEvent', () => {
  it('rejects anything that is not an event object', () => {
    for (const bad of [null, undefined, [], 'x', 5, true, {}, { hook_event_name: 5 }, { hook_event_name: '' }]) {
      assert.equal(sanitizeEvent(bad), null);
    }
  });

  it('keeps only known fields', () => {
    const evt = sanitizeEvent({ hook_event_name: 'PreToolUse', prompt: 'SECRET', transcript_path: 'C:/x', tool_response: 'big' });
    assert.deepEqual(Object.keys(evt).sort(), [
      'agent_id', 'agent_type', 'hook_event_name', 'notification_type', 'session_id', 'teammate_name', 'tool_input', 'tool_name',
    ]);
    assert.ok(!JSON.stringify(evt).includes('SECRET'));
  });

  it('drops wrong-typed fields instead of passing them on', () => {
    const evt = sanitizeEvent({
      hook_event_name: 'PreToolUse', tool_name: 5, agent_id: {}, agent_type: 7, teammate_name: [], notification_type: 9, session_id: false,
      tool_input: { file_path: 42, command: { a: 1 }, pattern: [] },
    });
    assert.equal(evt.tool_name, undefined);
    assert.equal(evt.agent_id, undefined);
    assert.equal(evt.agent_type, undefined);
    assert.equal(evt.teammate_name, undefined);
    assert.equal(evt.notification_type, undefined);
    assert.equal(evt.session_id, undefined);
    assert.deepEqual(evt.tool_input, {});
  });

  it('caps lengths', () => {
    const evt = sanitizeEvent({
      hook_event_name: 'x'.repeat(500), session_id: 's'.repeat(500), tool_name: 't'.repeat(500), agent_type: 'a'.repeat(500),
      tool_input: { file_path: 'f'.repeat(1000), command: `${'c'.repeat(500)} arg`, pattern: 'p'.repeat(500) },
    });
    assert.equal(evt.hook_event_name.length, 64);
    assert.equal(evt.session_id.length, 128);
    assert.equal(evt.tool_name.length, 128);
    assert.equal(evt.agent_type.length, 64);
    assert.equal(evt.tool_input.file_path.length, 300);
    assert.equal(evt.tool_input.command.length, 40);
    assert.equal(evt.tool_input.pattern.length, 40);
  });

  it('reduces a command to its first word', () => {
    assert.equal(sanitizeEvent({ hook_event_name: 'e', tool_input: { command: '  npm test --token=abc' } }).tool_input.command, 'npm');
  });

  it('ignores array tool_input', () => {
    assert.equal(sanitizeEvent({ hook_event_name: 'e', tool_input: [1] }).tool_input, undefined);
  });
});

describe('cleanId', () => {
  it('flattens nested ids to the basename', () => {
    assert.equal(cleanId('engineering/lead-dba'), 'lead-dba');
    assert.equal(cleanId('a\\b\\c'), 'c');
  });

  it('refuses prototype-related ids', () => {
    for (const id of ['__proto__', 'constructor', 'prototype', 'x/__proto__']) assert.equal(cleanId(id), undefined);
  });

  it('strips odd characters and keeps letters, digits and separators', () => {
    assert.equal(cleanId('lead<>ui'), 'leadui');
    assert.equal(cleanId('Insinyur Perangkat_Lunak-2'), 'Insinyur Perangkat_Lunak-2');
    assert.equal(cleanId('<>'), undefined);
  });
});
