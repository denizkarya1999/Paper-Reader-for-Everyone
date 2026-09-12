import { ArrowUp, BookOpen, LoaderCircle, Plus, Scan, Sparkles, StickyNote, X } from 'lucide-react';
import { MODELS, SUMMARY_QUESTION } from '@/lib/ai-config';
import type { Selection } from '@/lib/reader-types';

export type AnswerDraft = { answer: string; question: string; selection: Selection; model: string };
type Props = {
  scope: 'selection' | 'paper'; selection: Selection | null; draft: AnswerDraft | null;
  busy: boolean; question: string; model: string; pageCount: number; filename: string;
  onScope: (scope: 'selection' | 'paper') => void; onQuestion: (question: string) => void;
  onAsk: (question?: string) => void; onCancel: () => void; onClear: () => void;
  onPin: () => void; onNote: () => void; onSettings: () => void;
};
export default function AskPanel(props: Props) {
  const { scope, selection, draft, busy, question, model, pageCount, filename } = props;
  const whole = scope === 'paper', ready = whole || !!selection;
  const modelLabel = MODELS.find(item => item.id === model)?.label.split(' · ')[0] || model;
  return <div className="ask-panel">
    <div className="scope-switch" role="group" aria-label="Ask about">
      <button aria-pressed={!whole} disabled={busy} onClick={() => props.onScope('selection')}><Scan size={15}/>Selection</button>
      <button aria-pressed={whole} disabled={busy} onClick={() => props.onScope('paper')}><BookOpen size={15}/>Whole paper</button>
    </div>
    <div className="ask-content">
      {whole ? <div className="whole-paper-card">
        <div className="section-label">WHOLE PAPER <span>{pageCount || '…'} PAGES</span></div>
        <h2>{filename}</h2>
        <p>Read every page, including figures and tables. Get a summary or ask your own question below.</p>
        <p className="paper-disclosure">This sends the entire PDF to OpenAI, including any content already embedded in the file. It may cost more and take a few minutes.</p>
        <button className="button primary summary-button" disabled={busy || !pageCount} onClick={() => props.onAsk(SUMMARY_QUESTION)}><Sparkles size={16}/>Summarize whole paper</button>
      </div> : selection ? <>
        <div className="section-label">YOUR SELECTION <span>PAGE {selection.page}</span><button aria-label="Clear selection" disabled={busy} onClick={props.onClear}><X size={14}/></button></div>
        <div className="selection-card">{selection.image ? <img src={selection.image} alt={'Cropped area from page ' + selection.page}/> : <blockquote>{selection.text}</blockquote>}</div>
      </> : <div className="panel-empty"><span className="empty-icon"><Sparkles size={26} strokeWidth={1.4}/></span><h2>Make room for an “aha.”</h2><p>Highlight text or crop an area, then ask a question. Choose Whole paper for a summary.</p><div className="tip"><Scan size={17}/><span>Use <strong>Crop area</strong> for charts, equations, and scanned pages.</span></div></div>}
      {draft && <div className="answer-card"><div className="answer-label"><Sparkles size={16}/>ChatGPT <small>{MODELS.find(item => item.id === draft.model)?.label.split(' · ')[0] || draft.model}</small></div><p className="answer-text">{draft.answer}</p><button className="button pin-button" onClick={props.onPin}><StickyNote size={16}/>{whole ? 'Save as note on page 1' : 'Pin as sticky note'}</button></div>}
      {selection && !whole && !draft && !busy && <div className="suggestions"><p>A good place to start</p>{['Explain this in simple terms', 'What is the key takeaway?', 'What assumptions are being made?'].map(text => <button key={text} onClick={() => props.onQuestion(text)}>{text}<Plus size={14}/></button>)}</div>}
      {busy && <div className="thinking" role="status"><LoaderCircle size={17} className="spin"/>{whole ? 'Reading the whole paper…' : 'Reading your selection…'}<button onClick={props.onCancel}>Cancel</button></div>}
    </div>
    <div className="composer">
      <button className="model-choice" aria-label="Change AI model" onClick={props.onSettings} disabled={busy}><Sparkles size={12}/>{modelLabel}</button>
      <label className="sr-only" htmlFor="question">{whole ? 'Question about the whole paper' : 'Question about your selection'}</label>
      <textarea id="question" placeholder={whole ? 'Ask anything about this paper…' : selection ? 'What would you like to understand?' : 'Select part of your PDF first…'} value={question} maxLength={4000} disabled={!ready || busy} onChange={e => props.onQuestion(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); props.onAsk(); } }}/>
      <div className="composer-actions"><button className="text-button" disabled={!ready || busy} onClick={props.onNote}><Plus size={14}/>Write a note</button><button className="send-button" aria-label={whole ? 'Ask about whole paper' : 'Ask ChatGPT'} disabled={!ready || !question.trim() || busy} onClick={() => props.onAsk()}><ArrowUp size={20}/></button></div>
      <p>{whole ? 'The entire PDF and your question are sent to OpenAI.' : 'Only your selection and question are sent to OpenAI.'}</p>
    </div>
  </div>;
}
