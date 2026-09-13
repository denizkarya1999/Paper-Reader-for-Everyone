import { useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
export type UpdateState = { version: string; automatic: boolean; supported: boolean; status: 'idle' | 'checking' | 'downloading' | 'ready' | 'installing' | 'current' | 'error'; latest: string | null; percent: number; checkedAt: string | null; error: string | null };
export function useUpdates() {
  const [state, setState] = useState<UpdateState | null>(null);
  useEffect(() => {
    let alive = true;
    const update = (value: UpdateState) => { if (alive && value) setState(value); };
    const unsubscribe = window.paperReader?.onUpdates(update);
    void window.paperReader?.getUpdates().then(update).catch(() => {});
    return () => { alive = false; unsubscribe?.(); };
  }, []);
  return state;
}
async function install() {
  if (window.confirm('Install the update and restart Paper Reader? Your saved PDFs, notes, and chats will be kept. Finish any unsent question or unsaved drawing first.')) await window.paperReader?.installUpdate();
}
export function UpdateNotice() {
  const state = useUpdates();
  const [error, setError] = useState('');
  if (state?.status !== 'ready' && state?.status !== 'installing') return null;
  return <div className="update-notice" role="status"><Download size={17}/><span>{state.status === 'installing' ? 'Installing update. Check the Linux administrator prompt…' : `Version ${state.latest} is ready to install.`}{error && ' ' + error}{state.error && ' ' + state.error}</span><button className="button" disabled={state.status === 'installing'} onClick={() => { setError(''); void install().catch(() => setError('Wait for the current answer, then try again.')); }}>Install and restart</button></div>;
}
export default function UpdatesPanel() {
  const state = useUpdates();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const working = !state || ['checking', 'downloading', 'installing'].includes(state.status);
  return <><h2>App updates</h2><p>Stay up to date with new releases from the Paper Reader GitHub repository.</p><p><strong>Installed version: {state?.version ?? 'Loading…'}</strong></p><label className="update-choice"><input type="checkbox" checked={state?.automatic ?? true} disabled={!state?.supported || saving} onChange={event => { setSaving(true); setError(''); void window.paperReader?.setAutomaticUpdates(event.target.checked).catch(() => setError('Could not save this setting. Please try again.')).finally(() => setSaving(false)); }}/><span>Automatically check for and download updates</span></label><p className="settings-help">Checks shortly after opening the app and every four hours while it is running. Downloads are verified before installation. You choose when to install and restart; Linux may ask for your administrator password.</p>
  <div className="update-status" role="status">{!state?.supported ? 'Updates are available in the installed Linux app.' : state.status === 'checking' ? 'Checking GitHub for updates…' : state.status === 'downloading' ? `Downloading version ${state.latest}… ${state.percent}%` : state.status === 'ready' ? `Version ${state.latest} is ready to install.` : state.status === 'installing' ? 'Installing. Check the Linux administrator prompt…' : state.status === 'current' ? 'You have the latest release.' : state.status === 'error' ? 'The update could not finish.' : 'Ready to check for updates.'}</div>
  {state?.status === 'downloading' && <progress max={100} value={state.percent} aria-label="Update download progress"/>}
  {(error || state?.error) && <p className="inline-error" role="alert">{error || state?.error}</p>}
  <div className="update-actions"><button className="button" disabled={!state?.supported || working || state.status === 'ready'} onClick={() => { setError(''); void window.paperReader?.checkUpdates().catch(() => setError('Could not check for updates. Try again.')); }}><RefreshCw size={16}/>Check for updates</button>{state?.status === 'ready' && <button className="button primary" onClick={() => { setError(''); void install().catch(() => setError('Wait for the current answer, then try again.')); }}><Download size={16}/>Install and restart</button>}</div>
  {state?.checkedAt && <p className="settings-help">Last checked: {new Date(state.checkedAt).toLocaleString()}</p>}
  <h3>Natural AI voice</h3><p>Use <strong>Read aloud</strong> beside any AI answer to hear it in American English. The AI voice uses your OpenAI API credits only when you ask it to read. Pause, resume, or stop using the playback controls.</p></>;
}
