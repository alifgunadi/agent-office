// Desk ids and divisions shared by the server (lib/office.js) and the page (public/js/roles.js).
// This file is plain JavaScript that works both as a classic browser script and as a Node module,
// so there is one list of roles. test/roles.test.js checks the page's visual table against it.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OfficeRoles = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAIN_DESK = 'main';

  // Desk ids must match the `name` field in ~/.claude/agents/*.md frontmatter.
  const ROLE_IDS = [
    MAIN_DESK,
    'product-manager',
    'lead-business-analyst',
    'lead-solution-engineer',
    'lead-ux',
    'lead-system-analyst',
    'lead-software-engineer',
    'lead-ui',
    'lead-qa',
    'lead-security',
    'lead-dba',
    'lead-devops',
  ];

  // Divisions (rooms). Any id not listed here is a guest.
  const ZONE_IDS = {
    trainer: [MAIN_DESK],
    product: ['product-manager', 'lead-business-analyst', 'lead-system-analyst', 'lead-solution-engineer', 'lead-ux'],
    eng: ['lead-software-engineer', 'lead-ui', 'lead-dba', 'lead-devops'],
    qa: ['lead-qa', 'lead-security'],
  };

  return Object.freeze({ MAIN_DESK, ROLE_IDS: Object.freeze(ROLE_IDS.slice()), ZONE_IDS: Object.freeze(ZONE_IDS) });
});
