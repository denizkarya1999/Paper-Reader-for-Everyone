import { useEffect, useState } from 'react';
import { Cat, X } from 'lucide-react';
import { DEFAULT_FOCUS, type FocusSettings } from '@/lib/focus-types';

export default function FocusDialog({ onClose }: { onClose: () => void }) {
  const [value, setValue] = useState<FocusSettings>(DEFAULT_FOCUS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { let alive = true;
    if (!window.paperReader) { setLoading(false); return; }
    window.paperReader.getFocus().then(result => { if (alive) setValue(result); }).catch(() => { if (alive) setError('Could not load your cat settings.'); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  async function save() {
    if (!window.paperReader) { setError('The walking desktop cat is available in the installed Linux app.'); return; }
    setSaving(true); setError('');
    try { await window.paperReader.saveFocus(value); onClose(); }
    catch { setError('Could not save cat settings. Try again.'); }
    finally { setSaving(false); }
  }
  return <div className="modal-backdrop" onClick={() => { if (!saving) onClose(); }}><section className="modal focus-modal" role="dialog" aria-modal="true" aria-labelledby="focus-title" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape' && !saving) onClose(); }}>
    <button className="modal-close" aria-label="Close cat settings" onClick={onClose} disabled={saving}><X size={20}/></button>
    <span className="empty-icon cat-icon"><Cat size={30}/></span><h2 id="focus-title">A little reading companion</h2><p>Your cat walks along the bottom of your desktop while Paper Reader is open. Click the cat for a check-in or to hide it.</p>
    {error && <p className="connection-error" role="alert">{error}</p>}
    <form onSubmit={e => { e.preventDefault(); void save(); }}><fieldset disabled={loading || saving}>
      <label className="remember-key"><input autoFocus type="checkbox" checked={value.enabled} onChange={e => setValue({ ...value, enabled: e.target.checked })}/><span>Show my cat</span></label>
      <label htmlFor="cat-name">Cat’s name</label><input id="cat-name" value={value.name} maxLength={24} required onChange={e => setValue({ ...value, name: e.target.value })}/>
      <label htmlFor="cat-color">Coat</label><select id="cat-color" value={value.color} onChange={e => setValue({ ...value, color: e.target.value as FocusSettings['color'] })}><option value="ginger">Ginger tabby</option><option value="gray">Cloud gray</option><option value="cream">Vanilla cream</option></select>
      <label htmlFor="cat-frequency">Reminders</label><select id="cat-frequency" value={value.minutes === null ? 'never' : 'timed'} onChange={e => setValue({ ...value, minutes: e.target.value === 'never' ? null : 20 })}><option value="timed">Every N minutes</option><option value="never">Never — just keep me company</option></select>
      {value.minutes !== null && <><label htmlFor="cat-minutes">Minutes between reminders</label><input id="cat-minutes" type="number" min={1} max={10080} step={1} required value={value.minutes || ''} onChange={e => setValue({ ...value, minutes: Number(e.target.value) })}/></>}
      <label className="remember-key"><input type="checkbox" checked={value.quizzes} onChange={e => setValue({ ...value, quizzes: e.target.checked })}/><span>Ask me ChatGPT quizzes about my PDF</span></label>
      <small>{value.quizzes ? 'At each reminder, the open PDF is sent to OpenAI using your saved key and selected model. API charges apply. Questions and model answers are saved in Chats. Reveal the answer when you’re ready.' : 'Simple prompts such as “Did you understand what they say?” work offline and make no API requests.'}</small>
      <small>Reminders follow your timer; the cat does not watch other apps or detect distraction. “Never” stops timed reminders. Turn off “Show my cat” to disable it completely.</small>
      <div className="modal-actions"><button type="button" className="text-button" onClick={onClose}>Cancel</button><button className="button primary" type="submit">{saving ? 'Saving…' : 'Save cat settings'}</button></div>
    </fieldset></form>
  </section></div>;
}
