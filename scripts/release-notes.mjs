import { readFileSync } from 'node:fs';
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const changelog = readFileSync('CHANGELOG.md', 'utf8');
const section = changelog.split(/^## /m).find(section => section.startsWith(version));
if (!section) throw new Error('Missing release notes for ' + version);
console.log(section.slice(section.indexOf('\n') + 1).trim());
console.log('\nInstall the Linux `.deb` below. Existing PDFs, notes, chats, and connection settings are preserved. Starting with version 1.5.0, the app checks for GitHub releases and offers Install and restart.');
