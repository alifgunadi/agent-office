'use strict';
// Contract between the senders (hook.js, adapters, anything third-party) and the office:
// docs/event-schema.json documents it, these tests keep the document, the sanitizer and the
// state machine in agreement, and prove that senders written before the envelope still work.

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createOffice } = require('../lib/office');
const { sanitizeEvent } = require('../lib/sanitize');

const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'event-schema.json'), 'utf8'));
const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'events.json'), 'utf8'));

describe('docs/event-schema.json', () => {
  it('lists exactly the properties the sanitizer keeps', () => {
    const kept = Object.keys(sanitizeEvent({ hook_event_name: 'x' })).sort();
    assert.deepEqual(Object.keys(schema.properties).sort(), kept);
  });

  it('lists exactly the tool_input properties the sanitizer keeps', () => {
    const input = sanitizeEvent({ hook_event_name: 'x', tool_input: { file_path: 'a', command: 'b', pattern: 'c', subagent_type: 'd', other: 'e' } }).tool_input;
    assert.deepEqual(Object.keys(schema.properties.tool_input.properties).sort(), Object.keys(input).sort());
  });

  it('only requires hook_event_name, so older senders stay valid', () => {
    assert.deepEqual(schema.required, ['hook_event_name']);
  });

  it('documents the defaults the sanitizer applies', () => {
    const evt = sanitizeEvent({ hook_event_name: 'x' });
    assert.equal(evt.v, schema.properties.v.default);
    assert.equal(evt.source, schema.properties.source.default);
  });

  it('names every event the state machine handles', () => {
    const handled = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUseFailure', 'Notification', 'SubagentStart', 'SubagentStop', 'TeammateIdle', 'Stop', 'StopFailure', 'SessionEnd'];
    for (const name of handled) assert.ok(schema.properties.hook_event_name.description.includes(name), name);
  });
});

describe('sender fixtures', () => {
  let office;
  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
    office = createOffice();
  });
  afterEach(() => {
    office.dispose();
    mock.timers.reset();
  });

  for (const fixture of fixtures) {
    it(fixture.name, () => {
      const evt = sanitizeEvent(fixture.payload);
      assert.ok(evt, 'accepted as an event');
      office.handle(evt);
      const desk = office.state.desks[fixture.expect.desk];
      assert.ok(desk, `desk ${fixture.expect.desk} exists`);
      assert.equal(desk.status, fixture.expect.status);
      assert.equal(desk.activity, fixture.expect.activity);
      assert.ok(!JSON.stringify(office.snapshot()).includes('SECRET'), 'nothing outside the allowlist is stored');
    });
  }
});
