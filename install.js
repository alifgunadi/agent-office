'use strict';
// Connects this checkout to your agents. Safe to run again; use --dry-run to preview.
//   node install.js                       all targets
//   node install.js --target claude       one or more of: claude, antigravity, opencode
//   node install.js --dry-run
// Test or custom locations: --home <dir>, --claude-settings <file>, --antigravity-dir <dir>, --opencode-dir <dir>

const path = require('node:path');
const { install, TARGETS } = require('./lib/install');

function parseArgs(argv) {
  const opts = { dryRun: false, targets: TARGETS };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new Error(`${arg} needs a value`);
      return argv[++i];
    };
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--target') opts.targets = value().split(',').map((t) => t.trim()).filter(Boolean);
    else if (arg === '--home') opts.home = path.resolve(value());
    else if (arg === '--claude-settings') opts.claudeSettings = path.resolve(value());
    else if (arg === '--antigravity-dir') opts.antigravityDir = path.resolve(value());
    else if (arg === '--opencode-dir') opts.opencodeDir = path.resolve(value());
    else if (arg === '-h' || arg === '--help') opts.help = true;
    else throw new Error(`Unknown option ${arg}`);
  }
  const bad = opts.targets.filter((t) => !TARGETS.includes(t));
  if (bad.length) throw new Error(`Unknown target: ${bad.join(', ')} (use ${TARGETS.join(', ')})`);
  return opts;
}

try {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log('Usage: node install.js [--target claude,antigravity,opencode] [--dry-run]');
    process.exit(0);
  }
  const report = install({ root: __dirname, ...opts });
  for (const row of report) console.log(`${opts.dryRun ? '(dry run) ' : ''}${row.result.padEnd(9)} ${row.target.padEnd(12)} ${row.file}`);
  if (report.some((r) => r.result !== 'unchanged') && !opts.dryRun) {
    console.log('\nExisting files that changed were backed up next to the original as *.bak-<timestamp>.');
    console.log('Restart Claude Code, Antigravity and OpenCode so they pick up the new hooks.');
  }
} catch (err) {
  console.error(`install: ${err.message}`);
  process.exit(1);
}
