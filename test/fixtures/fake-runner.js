'use strict';
// A stand-in for a runner program, used by test/runner.test.js. It reads the whole prompt from stdin, then behaves by the first word.
const fs = require('node:fs');
const { spawn } = require('node:child_process');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', () => {
  // a context paragraph may come in front of the prompt (integrations); the command word is the first word of the prompt itself
  const label = 'Perintah pengguna:\n';
  const body = input.startsWith('[Konteks') ? input.slice(input.indexOf(label) + label.length) : input;
  const word = body.split(/\s/)[0];
  if (word === 'echo') { process.stdout.write('got: ' + input + '\n'); }
  else if (word === 'fail') { process.stderr.write('boom\n'); process.exitCode = 3; }
  else if (word === 'cwd') { process.stdout.write(process.cwd() + '\n'); }
  else if (word === 'env') { process.stdout.write(JSON.stringify(Object.keys(process.env)) + '\n'); }
  else if (word === 'args') { process.stdout.write(JSON.stringify(process.argv.slice(2)) + '\n'); }
  else if (word === 'big') { process.stdout.write('x'.repeat(200000)); }
  else if (word === 'slow') { setInterval(() => { }, 1000); }
  else if (word === 'spawnchild') {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    fs.writeFileSync('child.pid', String(child.pid));
    setInterval(() => { }, 1000);
  }
});
