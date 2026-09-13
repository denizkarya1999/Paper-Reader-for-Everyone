import { ArrowLeft, Cat, Database, Info, Moon, Palette, Sparkles, Sun, Trash2 } from 'lucide-react';
import type { ConnectionState } from '@/lib/ai-config';
import type { SettingsTab, Theme } from '@/lib/app-info';
import ConnectionDialog from './connection-dialog';
import FocusDialog from './focus-dialog';
import { useEffect, useState } from 'react';

type Props = {
  tab: SettingsTab; onTab: (value: SettingsTab) => void;
  theme: Theme; onTheme: (value: Theme) => string;
  connection: ConnectionState; onConnection: (value: ConnectionState) => void;
  paperCount: number; chatCount: number; onClearHistory: () => void;
  onBack: () => void; onAbout: () => void;
};
const sections = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'connection', label: 'ChatGPT connection', icon: Sparkles },
  { id: 'cat', label: 'Focus cat', icon: Cat },
  { id: 'storage', label: 'Local data', icon: Database },
] as const;
export default function SettingsPage(props: Props) {
  const [message, setMessage] = useState('');
  useEffect(() => setMessage(''), [props.tab]);
  return <section className="app-page settings-page" aria-labelledby="settings-title">
    <div className="page-heading"><div><span className="eyebrow">MAKE YOURSELF AT HOME</span><h1 id="settings-title" tabIndex={-1}>Settings</h1><p>A reading space that feels like yours.</p></div><button className="button" onClick={props.onBack}><ArrowLeft size={16}/>Back to reader</button></div>
    <div className="settings-layout"><nav className="settings-navigation" aria-label="Settings sections">{sections.map(({ id, label, icon: Icon }) => <button key={id} aria-current={props.tab === id ? 'page' : undefined} onClick={() => { props.onTab(id); setMessage(''); }}><Icon size={18}/>{label}</button>)}<button onClick={props.onAbout}><Info size={18}/>About Us</button></nav>
      <div className="settings-card">
        {message && <p className="settings-notice" role="status">{message}</p>}
        {props.tab === 'appearance' && <><h2>Appearance</h2><p>Choose a light or dark reading space. Your choice is remembered on this device.</p><div className="theme-options" role="group" aria-label="Color theme">{(['light', 'dark'] as const).map(theme => <button key={theme} className={'theme-option ' + theme} aria-pressed={props.theme === theme} onClick={() => setMessage(props.onTheme(theme))}><span className="theme-preview" aria-hidden="true"><span className="preview-sidebar"/><span className="preview-paper"/><span className="preview-note"/></span><span className="theme-option-label">{theme === 'light' ? <Sun size={18}/> : <Moon size={18}/>}<strong>{theme === 'light' ? 'Light' : 'Dark'}</strong><span>{props.theme === theme ? 'Selected' : 'Choose'}</span></span></button>)}</div><p className="settings-help">The PDF keeps its original page and figure colors in either theme.</p></>}
        {props.tab === 'connection' && <ConnectionDialog embedded connection={props.connection} onChange={props.onConnection} onClose={() => setMessage('Connection saved.')} />}
        {props.tab === 'cat' && <FocusDialog embedded onClose={() => setMessage('Cat settings saved.')} />}
        {props.tab === 'storage' && <><h2>Local data</h2><p>Your PDFs, notes, and chats are stored on this device.</p><div className="storage-totals"><div><strong>{props.paperCount}</strong><span>Saved PDFs</span></div><div><strong>{props.chatCount}</strong><span>Saved chats</span></div></div><h3>Take your reading with you</h3><p>Open a PDF and choose <strong>Save PDF + chats</strong> to save a portable ZIP with the annotated document and its chat history. Open that ZIP here to restore it.</p><div className="data-action"><div><h3>Clear chat history</h3><p>Delete conversations and flashcard sets for every PDF on this device. PDFs and pinned notes are kept. Previously saved ZIP bundles are unchanged.</p></div><button className="button danger" disabled={props.chatCount === 0} onClick={props.onClearHistory}><Trash2 size={15}/>Delete all chat history</button></div><p className="settings-help">To delete one conversation, open its PDF and go to Chats.</p></>}
      </div>
    </div>
  </section>;
}
