import ReadAloud from './read-aloud';
import { useRef } from 'react';
import { ArrowUp, BookOpen, ClipboardPaste, LoaderCircle, PenLine, Plus, Scan, Sparkles, StickyNote, X } from 'lucide-react';
import { MODELS, SUMMARY_QUESTION } from '@/lib/ai-config';
import type { Selection } from '@/lib/reader-types';
import { MAX_CROPS, selectionCrops, selectionLabel } from '@/lib/crops';
import RichResponse, { readClipboard } from './rich-response';

export type AnswerDraft = { answer: string; question: string; selection: Selection; model: string; chatId?: string };
type Props = {
  scope: 'selection' | 'paper'; selection: Selection | null; draft: AnswerDraft | null;
  busy: boolean; question: string; model: string; pageCount: number; filename: string;
  onScope: (scope: 'selection' | 'paper') => void; onQuestion: (question: string) => void;
  onAsk: (question?: string) => void; onCancel: () => void; onClear: () => void;
  onPin: () => void; onNote: () => void; onSettings: () => void;
  onRemoveCrop: (index: number) => void; onDrawCrop: (index: number) => void; onPage: (page: number) => void;
};
export default function AskPanel(props: Props) {
  const { scope, selection, draft, busy, question, model, pageCount, filename } = props;
  const whole = scope === 'paper' || !selection, ready = pageCount > 0;
  const crops = selectionCrops(selection);
  const modelLabel = MODELS.find(item => item.id === model)?.label.split(' · ')[0] || model;
  const documentLabel = /\.(?:pptx?|odp)$/i.test(filename) ? 'slide deck' : 'PDF';
  const composer = useRef<HTMLTextAreaElement>(null);
  async function paste() {
    const field = composer.current; if (!field) return;
    try {
      const value = await readClipboard(); if (!value) return;
      const start = field.selectionStart ?? question.length, end = field.selectionEnd ?? start;
      const next = (question.slice(0, start) + value + question.slice(end)).slice(0, 4000);
      props.onQuestion(next); const caret = Math.min(start + value.length, next.length);
      requestAnimationFrame(() => { field.focus(); field.setSelectionRange(caret, caret); });
    } catch {}
  }
  return <div className="ask-panel">
    <div className="scope-switch" role="group" aria-label="Ask about">
      <button aria-pressed={!whole} disabled={busy || !selection} title={selection ? 'Focus on your selection with whole-document context' : 'Highlight text or crop an area to focus your question'} onClick={() => props.onScope('selection')}><Scan size={15}/>Selection</button>
      <button aria-pressed={whole} disabled={busy} onClick={() => props.onScope('paper')}><BookOpen size={15}/>{documentLabel === 'slide deck' ? 'Whole deck' : 'Whole paper'}</button>
    </div>
    <div className="ask-content">
      {whole ? <div className="whole-paper-card">
        <div className="section-label">WHOLE {documentLabel.toUpperCase()} <span>{pageCount || '…'} {documentLabel === 'slide deck' ? 'SLIDES' : 'PAGES'}</span></div>
        <h2>{filename}</h2>
        <p>Ask anything about this {documentLabel} below. No selection needed. ChatGPT can use every {documentLabel === 'slide deck' ? 'slide' : 'page'}, including figures and tables.</p>
        <p className="paper-disclosure">This sends the entire {documentLabel} to OpenAI. It may cost more and take a few minutes.</p>
        <button className="button primary summary-button" disabled={busy || !pageCount} onClick={() => props.onAsk(SUMMARY_QUESTION)}><Sparkles size={16}/>Summarize whole {documentLabel}</button>
      </div> : selection ? <>
        <div className="section-label">{crops.length ? 'SELECTED CROPS' : 'YOUR SELECTION'} <span>{crops.length ? `${crops.length} / ${MAX_CROPS}` : `PAGE ${selection.page}`}</span><button aria-label="Clear selection" title="Clear all selections" disabled={busy} onClick={props.onClear}><X size={14}/></button></div>
        {crops.length ? <>
          <p className="crop-help">Drag more rectangles on this or another page to add crops. Use Draw on crop to mark details. All selected crops will be sent together.</p>
          <ol className="crop-list" aria-label="Selected crops">{crops.map((crop, index) => <li key={index} className="selection-card crop-card">
            <div className="crop-card-heading"><button className="text-button" onClick={() => props.onPage(crop.page)}>Crop {index + 1} · Page {crop.page}</button><button aria-label={`Remove crop ${index + 1}`} disabled={busy} onClick={() => props.onRemoveCrop(index)}><X size={14}/></button></div>
            {crop.image ? <img src={crop.image} alt={`Crop ${index + 1} from PDF page ${crop.page}`}/> : <p>Crop location saved. Select this area again to attach its image.</p>}
            {crop.image && <button className="text-button draw-crop-button" aria-label={`Draw on crop ${index + 1}`} disabled={busy} onClick={() => props.onDrawCrop(index)}><PenLine size={14}/>{crop.drawing?.strokes.length ? 'Edit drawing' : 'Draw on crop'}</button>}
          </li>)}</ol>
        </> : <div className="selection-card"><blockquote>{selection.text}</blockquote></div>}
        <p className="paper-disclosure">The whole {documentLabel} is included. ChatGPT can connect this selection to findings, definitions, and figures elsewhere, with page references. Sending the full document may cost more and take a few minutes.</p>
      </> : null}
      {draft && <div className="answer-card"><div className="answer-label"><Sparkles size={16}/>ChatGPT <small>{MODELS.find(item => item.id === draft.model)?.label.split(' · ')[0] || draft.model}</small></div><p className="crop-help">{selectionLabel(draft.selection)}</p><RichResponse text={draft.answer}/><ReadAloud id={'chat-' + (draft.chatId || 'draft')} text={draft.answer}/><button className="button pin-button" onClick={props.onPin}><StickyNote size={16}/>{whole ? `Save as note on ${documentLabel === 'slide deck' ? 'slide' : 'page'} 1` : 'Pin as sticky note'}</button></div>}
      {selection && !whole && !draft && !busy && <div className="suggestions"><p>A good place to start</p>{['Explain this in simple terms', 'What is the key takeaway?', 'What assumptions are being made?'].map(text => <button key={text} onClick={() => props.onQuestion(text)}>{text}<Plus size={14}/></button>)}</div>}
      {busy && <div className="thinking" role="status"><LoaderCircle size={17} className="spin"/>{whole ? `Reading the whole ${documentLabel}…` : `Reading your selection with the whole ${documentLabel}…`}<button onClick={props.onCancel}>Cancel</button></div>}
    </div>
    <div className="composer">
      <button className="model-choice" aria-label="Change AI model" onClick={props.onSettings} disabled={busy}><Sparkles size={12}/>{modelLabel}</button>
      <label className="sr-only" htmlFor="question">{whole ? (documentLabel === 'slide deck' ? 'Question about the whole slide deck' : 'Question about the whole paper') : 'Question about your selection'}</label>
      <textarea ref={composer} id="question" placeholder={whole ? `Ask anything about this ${documentLabel}…` : 'What would you like to understand?'} value={question} maxLength={4000} disabled={!ready || busy} onChange={e => props.onQuestion(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); props.onAsk(); } }}/>
      <div className="composer-actions"><div><button className="text-button" disabled={!ready || busy} onClick={props.onNote}><Plus size={14}/>Write a note</button><button className="text-button" disabled={!ready || busy} onClick={() => void paste()}><ClipboardPaste size={14}/>Paste</button></div><button className="send-button" aria-label={whole ? (documentLabel === 'slide deck' ? 'Ask about whole slide deck' : 'Ask about whole paper') : 'Ask ChatGPT'} disabled={!ready || !question.trim() || busy} onClick={() => props.onAsk()}><ArrowUp size={20}/></button></div>
      <p>{whole ? `The entire ${documentLabel} and your question are sent to OpenAI.` : crops.length ? `The entire ${documentLabel}, all ${crops.length} selected crop${crops.length === 1 ? '' : 's'}, and your question are sent to OpenAI.` : `The entire ${documentLabel}, your selection, and question are sent to OpenAI.`}</p>
    </div>
  </div>;
}
