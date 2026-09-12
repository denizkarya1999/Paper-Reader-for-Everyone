import { useEffect, useRef, useState } from 'react';
import { BookOpen, Upload, FileText, Highlighter, Scan, StickyNote, Sparkles, Download, Settings2, X, ChevronLeft, ChevronRight, Minus, Plus, ArrowUp, Check, Trash2, LoaderCircle, FolderOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import type { Note, Paper, Selection } from '@/lib/reader-types';
import { listPapers, removePaper, savePaper } from '@/lib/storage';
import PdfPage from '@/components/pdf-page';

export default function Home() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [paper, setPaper] = useState<Paper | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [mode, setMode] = useState<'text' | 'area'>('text');
  const [zoom, setZoom] = useState(1);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [question, setQuestion] = useState('');
  const [draft, setDraft] = useState<{ answer: string; question: string; selection: Selection } | null>(null);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [settings, setSettings] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4.1-mini');
  const [tab, setTab] = useState<'ask' | 'notes'>('ask');
  const [panel, setPanel] = useState(true);
  const [library, setLibrary] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [activeNote, setActiveNote] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<string | null>(null);
  const currentPaper = useRef<Paper | null>(null); currentPaper.current = paper;
  const saveSequence = useRef(0);

  useEffect(() => {
    let alive = true;
    listPapers().then(items => { if (alive) { setPapers(items); setHydrated(true); } }).catch(e => { if (alive) { setError(e.message); setHydrated(true); } });
    return () => { alive = false; if (request.current) window.paperReader?.cancel(request.current); };
  }, []);
  useEffect(() => {
    if (!paper || !hydrated) return;
    const sequence = ++saveSequence.current; setStatus('Saving…');
    savePaper(paper).then(() => {
      if (sequence === saveSequence.current) setStatus('Saved on this device');
      setPapers(items => [paper, ...items.filter(item => item.id !== paper.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    }).catch(e => { if (sequence === saveSequence.current) { setStatus('Not saved'); setError(e.message); } });
  }, [paper, hydrated]);

  function cancelQuestion() { if (request.current) window.paperReader?.cancel(request.current); request.current = null; setBusy(false); }
  function choosePaper(item: Paper) {
    cancelQuestion(); setPaper(item); setSelection(null); setDraft(null); setQuestion(''); setActiveNote(null); setLibrary(false); setPageCount(0); setZoom(1); setError('');
  }
  function updateNotes(notes: Note[]) { setPaper(item => item ? { ...item, notes, updatedAt: new Date().toISOString() } : item); }
  async function openFile(file?: File) {
    if (!file || opening) return;
    setError(''); setOpening(true);
    try {
      if (!file.name.toLowerCase().endsWith('.pdf')) throw new Error('Choose a PDF file.');
      if (file.size > 50 * 1024 * 1024) throw new Error('Choose a PDF smaller than 50 MB.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', window.location.href).href;
      const task = pdfjs.getDocument({ data: bytes.slice() });
      try { const pdf = await task.promise; await pdf.destroy(); } finally { await task.destroy(); }
      const id = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b => b.toString(16).padStart(2, '0')).join('');
      const existing = papers.find(item => item.id === id);
      if (existing) { choosePaper(existing); return; }
      const { importNotes } = await import('@/lib/pdf-export');
      choosePaper({ id, name: file.name, bytes, notes: await importNotes(bytes), page: 1, updatedAt: new Date().toISOString() });
    } catch (e) { setError(e instanceof Error && /password/i.test(e.message) ? 'This PDF is password protected. Open an unlocked copy.' : e instanceof Error ? e.message : 'This PDF could not be opened.'); }
    finally { setOpening(false); if (input.current) input.current.value = ''; }
  }
  async function browse() {
    if (!window.paperReader) { input.current?.click(); return; }
    try { const file = await window.paperReader.openPdf(); if (file) await openFile(new File([new Uint8Array(file.bytes)], file.name, { type: 'application/pdf' })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not open the file picker.'); }
  }
  async function openExample() {
    try { const { examplePdf } = await import('@/lib/pdf-export'); await openFile(new File([new Uint8Array(await examplePdf())], 'A little guide to reading research.pdf', { type: 'application/pdf' })); }
    catch { setError('The example could not be opened. Please choose a PDF.'); }
  }
  function changePage(page: number) { setPaper(item => item ? { ...item, page: Math.max(1, Math.min(pageCount || 1, page)) } : item); setActiveNote(null); }
  function pickSelection(value: Selection) { if (busy) return; setSelection(value); setDraft(null); setTab('ask'); setPanel(true); setActiveNote(null); }
  async function ask() {
    if (!selection || !question.trim() || busy || !paper) return;
    if (!apiKey) { setSettings(true); return; }
    if (!window.paperReader) { setError('ChatGPT is available in the installed desktop app.'); return; }
    const selected = selection; const asked = question.trim(); const paperId = paper.id;
    const id = crypto.randomUUID(); request.current = id; setBusy(true); setDraft(null); setError('');
    try {
      const result = await window.paperReader.ask({ id, apiKey, question: asked, text: selected.text, image: selected.image, page: selected.page, model });
      if (request.current !== id || currentPaper.current?.id !== paperId) return;
      if (result.error) throw new Error(result.error);
      setDraft({ answer: (result.answer || '') + (result.incomplete ? '\n\n[Answer reached the length limit.]' : ''), question: asked, selection: selected });
    } catch (e) { if (request.current === id) setError(e instanceof Error ? e.message : 'Connection interrupted. Please try again.'); }
    finally { if (request.current === id) { setBusy(false); request.current = null; } }
  }
  function pinDraft() {
    if (!paper || !draft) return;
    const note: Note = { id: crypto.randomUUID(), selection: draft.selection, question: draft.question, answer: draft.answer, color: 'yellow', createdAt: new Date().toISOString() };
    setPaper(item => item ? { ...item, notes: [...item.notes, note], page: note.selection.page, updatedAt: new Date().toISOString() } : item);
    setDraft(null); setQuestion(''); setTab('notes'); setActiveNote(note.id);
  }
  function addOwnNote() {
    if (!selection || !paper) return;
    const note: Note = { id: crypto.randomUUID(), selection, question: '', answer: question.trim() || 'Write your note here…', color: 'yellow', createdAt: new Date().toISOString() };
    updateNotes([...paper.notes, note]); setQuestion(''); setActiveNote(note.id); setTab('notes');
  }
  async function downloadPdf() {
    if (!paper || exporting) return;
    setExporting(true); setError('');
    try {
      const { exportPdf } = await import('@/lib/pdf-export');
      const bytes = await exportPdf(paper); const name = paper.name.replace(/\.pdf$/i, '') + ' - annotated.pdf';
      if (window.paperReader) { await window.paperReader.savePdf({ name, bytes }); }
      else { const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30_000); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not export this PDF. Your notes remain on this device.'); }
    finally { setExporting(false); }
  }
  const noteCount = paper?.notes.length ?? 0;
  return <main className="app-shell" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void openFile(e.dataTransfer.files[0]); }}>
    <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={e => void openFile(e.target.files?.[0])}/>
    <header className="app-header"><button className="brand" onClick={() => setLibrary(true)} aria-label="Paper Reader for Everyone — open library"><span className="brand-mark"><BookOpen size={22}/></span><span>Paper Reader<small>for everyone</small></span><span className="version">1.0</span></button><div className="header-actions"><button className="button quiet" onClick={() => setLibrary(true)}><FolderOpen size={17}/><span>My PDFs</span></button><button className="button quiet" onClick={() => setSettings(true)}><Settings2 size={17}/><span>Connection</span></button><button className="button primary" onClick={() => void browse()} disabled={opening}>{opening ? <LoaderCircle className="spin" size={17}/> : <Plus size={18}/>}<span>Open PDF</span></button></div></header>
    {error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={17}/></button></div>}
    {!paper ? <section className="welcome"><div className="welcome-heading"><span className="eyebrow">YOUR READING SPACE</span><h1>A little clarity.<br/>In the margins.</h1><p>Read a paper. Ask a question.<br/>Keep the insight right where you found it.</p></div><div className="upload-card"><div className="file-symbol"><FileText size={32} strokeWidth={1.5}/><span><Plus size={14}/></span></div><h2>Start with a PDF</h2><p>Drop your file here, or choose one from your device.</p><button className="button primary large" onClick={() => void browse()} disabled={opening || !hydrated}>{opening ? <LoaderCircle className="spin" size={18}/> : <Upload size={18}/>} {opening ? 'Opening PDF…' : 'Choose PDF'}</button><small>Up to 50 MB · Saved on this device</small><button className="example-link" onClick={() => void openExample()} disabled={opening || !hydrated}>Or try an example <ChevronRight size={15}/></button></div><div className="how-it-works"><div><Highlighter size={19}/><strong>01</strong><span>Highlight a passage</span></div><div><Sparkles size={19}/><strong>02</strong><span>Ask ChatGPT</span></div><div><StickyNote size={19}/><strong>03</strong><span>Pin the answer</span></div></div>{papers.length > 0 && <div className="recent"><h2>Pick up where you left off</h2>{papers.slice(0, 3).map(item => <button key={item.id} className="recent-paper" onClick={() => choosePaper(item)}><FileText size={21}/><span>{item.name}<small>{item.notes.length} notes · {new Date(item.updatedAt).toLocaleDateString()}</small></span><ChevronRight size={18}/></button>)}</div>}</section> : <>
      <div className="document-bar"><div className="document-name"><FileText size={18}/><span title={paper.name}>{paper.name}</span><small><Check size={13}/>{status}</small></div><button className="button" onClick={() => void downloadPdf()} disabled={exporting}>{exporting ? <LoaderCircle className="spin" size={16}/> : <Download size={16}/>}<span>Save PDF</span></button></div>
      <div className={`workspace ${panel ? '' : 'panel-hidden'}`}><section className="reader" aria-label="PDF reader"><div className="toolbar"><div className="tool-group"><button className={mode === 'text' ? 'tool active' : 'tool'} aria-pressed={mode === 'text'} onClick={() => setMode('text')}><Highlighter size={16}/><span>Highlight</span></button><button className={mode === 'area' ? 'tool active' : 'tool'} aria-pressed={mode === 'area'} onClick={() => setMode('area')}><Scan size={16}/><span>Crop area</span></button></div><div className="page-controls"><button aria-label="Previous page" disabled={paper.page <= 1} onClick={() => changePage(paper.page - 1)}><ChevronLeft size={17}/></button><label><span className="sr-only">Page number</span><input key={`${paper.id}-${paper.page}`} type="number" min="1" max={pageCount || 1} defaultValue={paper.page} onBlur={e => changePage(Number(e.target.value) || 1)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}/></label><span>/ {pageCount || '…'}</span><button aria-label="Next page" disabled={!pageCount || paper.page >= pageCount} onClick={() => changePage(paper.page + 1)}><ChevronRight size={17}/></button></div><div className="zoom-controls"><button aria-label="Zoom out" disabled={zoom <= .6} onClick={() => setZoom(z => Math.max(.6, +(z - .2).toFixed(1)))}><Minus size={16}/></button><button className="zoom-value" onClick={() => setZoom(1)} title="Fit to width">{Math.round(zoom * 100)}%</button><button aria-label="Zoom in" disabled={zoom >= 2} onClick={() => setZoom(z => Math.min(2, +(z + .2).toFixed(1)))}><Plus size={16}/></button></div><button className="panel-toggle" aria-label={panel ? 'Hide notes panel' : 'Show notes panel'} onClick={() => setPanel(!panel)}>{panel ? <PanelRightClose size={18}/> : <PanelRightOpen size={18}/>}</button></div><div className="page-scroll"><PdfPage bytes={paper.bytes} pageNumber={paper.page} zoom={zoom} mode={mode} notes={paper.notes} selection={selection} activeNote={activeNote} onSelect={pickSelection} onNote={id => { setActiveNote(id); setTab('notes'); setPanel(true); }} onCount={setPageCount} onError={setError}/></div><div className="reader-hint">{mode === 'text' ? 'Drag across text to highlight a passage.' : 'Drag a rectangle around a figure, equation, or passage.'}<span>Your original PDF stays intact.</span></div></section>
      {panel && <aside className="side-panel" aria-label="Questions and notes"><div className="panel-tabs"><button className={tab === 'ask' ? 'selected' : ''} onClick={() => setTab('ask')}><Sparkles size={17}/>Ask ChatGPT</button><button className={tab === 'notes' ? 'selected' : ''} onClick={() => setTab('notes')}><StickyNote size={17}/>Notes <span className="count">{noteCount}</span></button></div>{tab === 'ask' ? <div className="ask-panel"><div className="ask-content">{selection ? <><div className="section-label">YOUR SELECTION <span>PAGE {selection.page}</span><button aria-label="Clear selection" disabled={busy} onClick={() => { setSelection(null); setDraft(null); }}><X size={14}/></button></div><div className="selection-card">{selection.image ? <img src={selection.image} alt={`Cropped area from page ${selection.page}`}/> : <blockquote>{selection.text}</blockquote>}</div>{draft ? <div className="answer-card"><div className="answer-label"><Sparkles size={16}/>ChatGPT <small>{model}</small></div><p className="answer-text">{draft.answer}</p><button className="button pin-button" onClick={pinDraft}><StickyNote size={16}/>Pin as sticky note</button></div> : <div className="suggestions"><p>A good place to start</p>{['Explain this in simple terms', 'What is the key takeaway?', 'What assumptions are being made?'].map(text => <button key={text} onClick={() => setQuestion(text)}>{text}<Plus size={14}/></button>)}</div>}{busy && <div className="thinking" role="status"><LoaderCircle size={17} className="spin"/>Reading your selection… <button onClick={cancelQuestion}>Cancel</button></div>}</> : <div className="panel-empty"><span className="empty-icon"><Sparkles size={26} strokeWidth={1.4}/></span><h2>Make room for an “aha.”</h2><p>Highlight text or crop an area of your PDF, then ask a question about it.</p><div className="tip"><Scan size={17}/><span>Use <strong>Crop area</strong> for charts, equations, and scanned pages.</span></div></div>}</div><div className="composer"><label className="sr-only" htmlFor="question">Question about your selection</label><textarea id="question" placeholder={selection ? 'What would you like to understand?' : 'Select part of your PDF first…'} value={question} maxLength={4000} disabled={!selection || busy} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void ask(); } }}/><div className="composer-actions"><button className="text-button" disabled={!selection || busy} onClick={addOwnNote}><Plus size={14}/>Write a note</button><button className="send-button" aria-label="Ask ChatGPT" disabled={!selection || !question.trim() || busy} onClick={() => void ask()}><ArrowUp size={20}/></button></div><p>Only your selection and question are sent to OpenAI.</p></div></div> : <div className="notes-panel">{noteCount === 0 ? <div className="panel-empty"><span className="empty-icon yellow"><StickyNote size={28}/></span><h2>Keep the useful bits.</h2><p>Pin a ChatGPT answer or write your own note. Each one stays linked to its place in the PDF.</p></div> : <><p className="notes-caption">Your thoughts, right in the margins.</p>{paper.notes.map((note, index) => <article key={note.id} className={`sticky-card ${note.color} ${activeNote === note.id ? 'focused' : ''}`}><div className="sticky-top"><button onClick={() => { setPaper(item => item ? { ...item, page: note.selection.page } : item); setActiveNote(note.id); }}><StickyNote size={14}/>Note {index + 1}<span>· Page {note.selection.page}</span></button><button aria-label={`Delete note ${index + 1}`} onClick={() => updateNotes(paper.notes.filter(item => item.id !== note.id))}><Trash2 size={14}/></button></div>{note.question && <h3>{note.question}</h3>}{note.selection.text && <blockquote>{note.selection.text}</blockquote>}<textarea aria-label={`Edit note ${index + 1}`} value={note.answer} maxLength={20000} onChange={e => updateNotes(paper.notes.map(item => item.id === note.id ? { ...item, answer: e.target.value } : item))}/><div className="sticky-bottom"><span>{new Date(note.createdAt).toLocaleDateString()}</span><div className="color-options">{(['yellow', 'blue', 'pink'] as const).map(color => <button key={color} className={color} aria-label={`Make note ${index + 1} ${color}`} aria-pressed={note.color === color} onClick={() => updateNotes(paper.notes.map(item => item.id === note.id ? { ...item, color } : item))}>{note.color === color && <Check size={11}/>}</button>)}</div></div></article>)}</>}</div>}</aside>}
      </div></>}
    <footer className="app-footer"><span>Paper Reader for Everyone <span className="footer-version">/ 1.0</span></span><span>Made by Deniz K. Acikbas</span></footer>
    {settings && <div className="modal-backdrop" onClick={() => setSettings(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="connection-title" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setSettings(false); }}><button className="modal-close" aria-label="Close connection settings" onClick={() => setSettings(false)}><X size={20}/></button><span className="empty-icon"><Sparkles size={25}/></span><h2 id="connection-title">Connect to OpenAI</h2><p>Use your OpenAI API key to ask ChatGPT about your selections. API usage is billed separately from a ChatGPT subscription.</p><label htmlFor="api-key">OpenAI API key</label><input autoFocus id="api-key" type="password" autoComplete="off" spellCheck={false} placeholder="sk-…" value={apiKey} onChange={e => setApiKey(e.target.value.trim())}/><small>Your key stays in memory until you close the app. It is sent only to OpenAI and is never saved.</small><label htmlFor="model">Model</label><select id="model" value={model} onChange={e => setModel(e.target.value)}><option value="gpt-4.1-mini">GPT-4.1 mini · everyday reading</option><option value="gpt-4.1">GPT-4.1 · complex questions</option></select><div className="modal-actions"><a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">Get an API key</a><button className="button primary" onClick={() => setSettings(false)}>Done</button></div></section></div>}
    {library && <div className="modal-backdrop" onClick={() => setLibrary(false)}><section className="modal library-modal" role="dialog" aria-modal="true" aria-labelledby="library-title" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setLibrary(false); }}><button autoFocus className="modal-close" aria-label="Close library" onClick={() => setLibrary(false)}><X size={20}/></button><h2 id="library-title">My PDFs</h2><p>Saved on this device. Save annotated PDFs to back them up or move to another computer.</p>{papers.length ? papers.map(item => <div className="library-row" key={item.id}><button className="recent-paper" onClick={() => choosePaper(item)}><FileText size={20}/><span>{item.name}<small>{item.notes.length} notes · Page {item.page}</small></span></button><button aria-label={`Remove ${item.name} from this device`} title="Remove from this device" onClick={() => { if (window.confirm(`Remove “${item.name}” and its notes from this device? Save an annotated copy first to keep them.`)) { void removePaper(item.id).then(() => { setPapers(items => items.filter(p => p.id !== item.id)); if (paper?.id === item.id) { cancelQuestion(); setPaper(null); setSelection(null); setDraft(null); } }).catch(e => setError(e.message)); } }}><Trash2 size={17}/></button></div>) : <p className="library-empty">Your next good read starts here.</p>}<button className="button primary" onClick={() => { setLibrary(false); void browse(); }}><Plus size={17}/>Open PDF</button></section></div>}
  </main>;
}
