import { useState } from 'react';
import { LoaderCircle, Sparkles, Trash2, X } from 'lucide-react';
import { MODELS, type ConnectionState } from '@/lib/ai-config';

type Props = { connection: ConnectionState; onClose: () => void; onChange: (state: ConnectionState) => void };
export default function ConnectionDialog({ connection, onClose, onChange }: Props) {
  const [key, setKey] = useState('');
  const [model, setModel] = useState(connection.model);
  const [remember, setRemember] = useState(connection.canRemember && (connection.saved || !connection.hasKey));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(connection.error || '');
  async function save() {
    if (!window.paperReader) { setError('Save your connection in the installed Linux app.'); return; }
    setBusy(true); setError('');
    try {
      const result = await window.paperReader.saveConnection({ apiKey: key.trim() || undefined, model, remember });
      if (result.error) { setError(result.error); return; }
      setKey(''); onChange(result); onClose();
    } catch { setError('Could not save the connection. Please try again.'); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!window.paperReader) return;
    setBusy(true); setError('');
    try {
      const result = await window.paperReader.clearConnection();
      if (result.error) { setError(result.error); return; }
      setKey(''); onChange(result);
    } catch { setError('Could not remove the saved key. Please try again.'); }
    finally { setBusy(false); }
  }
  return <div className="modal-backdrop" onClick={() => { if (!busy) onClose(); }}>
    <section className="modal connection-modal" role="dialog" aria-modal="true" aria-labelledby="connection-title" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape' && !busy) onClose(); }}>
      <button className="modal-close" aria-label="Close connection settings" disabled={busy} onClick={onClose}><X size={20}/></button>
      <span className="empty-icon"><Sparkles size={25}/></span>
      <h2 id="connection-title">{connection.hasKey ? 'Your OpenAI connection' : 'Set up ChatGPT'}</h2>
      <p>{connection.hasKey ? 'Your key is ready. Replace it below or choose a different model.' : 'Add your OpenAI API key once to ask questions and summarize papers.'} API usage is billed separately from a ChatGPT subscription.</p>
      {error && <p className="connection-error" role="alert">{error}</p>}
      <form onSubmit={e => { e.preventDefault(); void save(); }}>
        <label htmlFor="api-key">{connection.hasKey ? 'Replace API key (optional)' : 'OpenAI API key'}</label>
        <input autoFocus id="api-key" type="password" autoComplete="off" spellCheck={false} placeholder={connection.hasKey ? 'Leave blank to keep your current key' : 'sk-…'} value={key} maxLength={512} disabled={busy} onChange={e => setKey(e.target.value)}/>
        <small>{connection.saved ? 'A protected key is saved on this device.' : connection.hasKey ? 'This key is in use for the current session.' : 'Your key is sent only to OpenAI, never saved inside a PDF.'}</small>
        <label className="remember-key"><input type="checkbox" checked={remember} disabled={busy || !connection.canRemember} onChange={e => setRemember(e.target.checked)}/><span>Remember my key on this device</span></label>
        <small>{connection.canRemember ? 'Protected by your Linux keyring and loaded automatically when you start the app.' : 'Secure storage is unavailable. Unlock or enable GNOME Keyring or KWallet and restart to remember your key. You can use it for this session now.'}{!remember && connection.saved ? ' Saving for this session removes the previous saved key.' : ''}</small>
        <label htmlFor="model">Model</label>
        <select id="model" value={model} disabled={busy} onChange={e => setModel(e.target.value)}>{MODELS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
        <small>GPT-5.6 Luna is the everyday default. GPT-6 Astra is the most capable choice and costs more per token. Model access depends on your API account.</small>
        <div className="modal-actions"><a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">Get an API key</a><button className="button primary" type="submit" disabled={busy || (!connection.hasKey && !key.trim())}>{busy && <LoaderCircle size={14} className="spin"/>}{remember ? 'Save connection' : 'Use for this session'}</button></div>
      </form>
      <div className="connection-footer"><button className="text-button" disabled={busy} onClick={onClose}>{connection.hasKey ? 'Cancel' : 'Read without AI for now'}</button>{(connection.hasKey || connection.saved) && <button className="text-button remove-key" disabled={busy} onClick={() => void remove()}><Trash2 size={13}/>Remove key</button>}</div>
    </section>
  </div>;
}
