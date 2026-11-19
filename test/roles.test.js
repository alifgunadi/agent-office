'use strict';
// The server (lib/office.js) and the page (public/js/roles.js) must agree on who the roles are.
// roles-shared.js is the single list; roles.js adds the looks of each role for the canvas.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const shared = require('../public/js/roles-shared');
const office = require('../lib/office');

const page = vm.createContext({ OfficeRoles: shared });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'roles.js'), 'utf8'), page, { filename: 'roles.js' });
const get = (expr) => vm.runInContext(expr, page);

describe('shared roles', () => {
  it('the server uses the shared list', () => {
    assert.deepEqual([...office.ROLE_IDS], [...shared.ROLE_IDS]);
    assert.equal(shared.ROLE_IDS[0], shared.MAIN_DESK);
  });

  it('the page has a look for exactly the shared roles, in the same order', () => {
    // spread copies the array into this realm; deepStrictEqual compares prototypes and arrays from a vm context differ
    assert.deepEqual([...get('Object.keys(ROLES)')], [...shared.ROLE_IDS]);
  });

  it('the page uses the shared divisions and every role belongs to exactly one', () => {
    assert.equal(get('ZONE_IDS'), shared.ZONE_IDS);
    const seen = new Map();
    for (const [zone, ids] of Object.entries(shared.ZONE_IDS)) for (const id of ids) {
      assert.ok(!seen.has(id), `${id} in two divisions`);
      seen.set(id, zone);
    }
    assert.deepEqual([...seen.keys()].sort(), [...shared.ROLE_IDS].sort());
    for (const id of shared.ROLE_IDS) assert.equal(get(`ZONE_OF[${JSON.stringify(id)}]`), seen.get(id), id);
  });

  it('the shared data cannot be changed by accident', () => {
    assert.ok(Object.isFrozen(shared));
    assert.ok(Object.isFrozen(shared.ROLE_IDS));
    assert.ok(Object.isFrozen(shared.ZONE_IDS));
  });
});
