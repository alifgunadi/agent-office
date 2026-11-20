'use strict';
// @mention rules (public/js/mentions.js), shared by the dock and, later, the server.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../public/js/mentions');
const roles = require('../public/js/roles-shared');

const labelOf = (id) => ({ 'lead-qa': 'Lead QA', 'lead-ux': 'Lead UX' }[id] || id);

describe('mentions: resolving who a prompt is for', () => {
  it('an agent, written as its desk id or without the "lead-" prefix', () => {
    assert.deepEqual(M.resolve('tolong cek @lead-qa ini').targets, ['lead-qa']);
    assert.deepEqual(M.resolve('@ux review').targets, ['lead-ux']);
    assert.deepEqual(M.resolve('@product-manager').targets, ['product-manager']);
  });

  it('a division means every agent in it, and "engineering" is the same as "eng"', () => {
    assert.deepEqual(M.resolve('@eng').targets, ['lead-software-engineer', 'lead-ui', 'lead-dba', 'lead-devops']);
    assert.deepEqual(M.resolve('@engineering').targets, M.resolve('@eng').targets);
    assert.equal(M.resolve('@product').targets.length, 5);
    assert.equal(M.resolve('@qa').targets.length, 2);
  });

  it('@everyone and @all mean the 11 fixed agents, never AlifGunadi', () => {
    for (const word of ['@everyone', '@all', '@EVERYONE']) {
      const r = M.resolve('semua tolong ' + word);
      assert.equal(r.everyone, true);
      assert.equal(r.targets.length, 11);
      assert.ok(!r.targets.includes(roles.MAIN_DESK));
    }
  });

  it('removes duplicates and keeps the order of first mention', () => {
    const r = M.resolve('@qa dan @lead-qa lalu @lead-security dan @lead-ui');
    assert.deepEqual(r.targets, ['lead-qa', 'lead-security', 'lead-ui']);
  });

  it('is not case sensitive', () => {
    assert.deepEqual(M.resolve('@Lead-QA').targets, ['lead-qa']);
    assert.deepEqual(M.resolve('@ENG').targets.length, 4);
  });

  it('unknown @words are plain text, reported as unknown; AlifGunadi cannot be addressed', () => {
    const r = M.resolve('halo @nobody dan @main dan @trainer');
    assert.deepEqual(r.targets, []);
    assert.deepEqual(r.unknown, ['nobody', 'main', 'trainer']);
  });

  it('an @ inside a word (an email address) is not a mention', () => {
    assert.deepEqual(M.resolve('kirim ke alif@qa.example').targets, []);
    assert.deepEqual(M.resolve('(@lead-ui) dan,@lead-dba').targets, ['lead-ui', 'lead-dba']);
  });

  it('guests count only while they are in the office', () => {
    assert.deepEqual(M.resolve('@Explore', []).targets, []);
    assert.deepEqual(M.resolve('@Explore', ['Explore']).targets, ['Explore']);
    assert.ok(!M.resolve('@everyone', ['Explore']).targets.includes('Explore'), '@everyone is the 11 fixed agents only');
  });

  it('records where each mention is, for highlighting', () => {
    const text = 'a @lead-qa b';
    const m = M.resolve(text).mentions[0];
    assert.equal(text.slice(m.start, m.end), '@lead-qa');
  });
});

describe('mentions: typing and suggestions', () => {
  it('finds the @word being typed at the caret, and nothing when the caret is elsewhere', () => {
    assert.deepEqual(M.activeMention('tolong @lea', 11), { start: 7, end: 11, query: 'lea' });
    assert.deepEqual(M.activeMention('@', 1), { start: 0, end: 1, query: '' });
    assert.equal(M.activeMention('tolong @lea ok', 14), null);
    assert.equal(M.activeMention('alif@qa', 7), null, 'an email address');
    assert.equal(M.activeMention('halo', 4), null);
  });

  it('offers the three groups in the design order, filtered by what was typed', () => {
    const all = M.suggestions('', [], labelOf);
    const groups = [...new Set(all.map((s) => s.group))];
    assert.deepEqual(groups, ['Semua Tim', 'Divisi', 'Agent']);
    assert.equal(all.find((s) => s.token === 'product').hint, '5 agent');
    assert.equal(all.find((s) => s.token === 'eng').hint, '4 agent');
    assert.equal(all.find((s) => s.token === 'qa').hint, '2 agent');
    assert.equal(all.filter((s) => s.group === 'Agent').length, 11);
    assert.deepEqual(M.suggestions('lead-q', [], labelOf).map((s) => s.token), ['lead-qa']);
    assert.deepEqual(M.suggestions('ux', [], labelOf).map((s) => s.token), ['lead-ux'], 'matches without the lead- prefix');
    assert.deepEqual(M.suggestions('ev', []).map((s) => s.token), ['everyone']);
    assert.deepEqual(M.suggestions('zzz', []), []);
  });

  it('includes guests that are in the office', () => {
    assert.ok(M.suggestions('exp', ['Explore']).some((s) => s.token === 'Explore'));
  });

  it('inserting a suggestion replaces the partial word and moves the caret after it', () => {
    const r = M.insertMention('tolong @lea sekarang', 11, 'lead-ui');
    assert.equal(r.text, 'tolong @lead-ui  sekarang');
    assert.equal(r.caret, 'tolong @lead-ui '.length);
    assert.deepEqual(M.insertMention('', 0, 'qa'), { text: '@qa ', caret: 4 });
  });
});

describe('mentions: the preview line', () => {
  it('says what will happen in the words of the design', () => {
    assert.equal(M.describe(M.resolve('@eng').targets, M.resolve('@eng'), labelOf), 'Akan dikirim ke 4 agent Engineering');
    assert.equal(M.describe(M.resolve('@qa').targets, M.resolve('@qa'), labelOf), 'Akan dikirim ke 2 agent QA');
    assert.equal(M.describe(M.resolve('@everyone').targets, M.resolve('@everyone'), labelOf), 'Akan dikirim ke semua 11 agent');
    assert.equal(M.describe(['lead-qa'], M.resolve('@lead-qa'), labelOf), 'Akan dikirim ke Lead QA');
    assert.equal(M.describe(['lead-qa', 'lead-ux'], M.resolve('@lead-qa @lead-ux'), labelOf), 'Akan dikirim ke 2 agent');
    assert.equal(M.describe([], M.resolve(''), labelOf), '');
  });
});
