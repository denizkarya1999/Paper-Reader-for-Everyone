import manifest from '../package.json';

export const APP_INFO = {
  name: 'Paper Reader for Everyone',
  version: manifest.version,
  developer: manifest.author.name,
  languages: 'TypeScript, JavaScript, HTML and CSS',
  agent: 'OpenAI Codex',
  technologies: 'Electron, React, PDF.js and pdf-lib',
};
export type Theme = 'light' | 'dark';
export type SettingsTab = 'appearance' | 'connection' | 'cat' | 'storage' | 'updates';
