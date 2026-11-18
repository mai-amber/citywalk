import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
for (const file of ['server.mjs', 'docs/app.js', 'docs/sensors.js', 'docs/core.js', 'docs/street-view-controls.js', 'docs/quest.js', 'docs/quest-controls.js', 'docs/street-tiles.js', 'docs/progressive-panorama.js']) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}
const { apiKey } = JSON.parse(readFileSync('docs/maps-config.json', 'utf8'));
if (process.argv.includes('--release') && !/^AIza[\w-]{35}$/.test(apiKey)) throw new Error('Connect the restricted Maps browser key before publishing.');
console.log('Source checks passed.');
