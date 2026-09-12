import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { LoaderCircle, StickyNote } from 'lucide-react';
import type { PDFDocumentProxy, RenderTask, TextLayer } from 'pdfjs-dist';
import type { Note, Rect, Selection } from '@/lib/reader-types';
import 'pdfjs-dist/web/pdf_viewer.css';

type Props = { bytes: Uint8Array; pageNumber: number; zoom: number; mode: 'text' | 'area'; notes: Note[]; selection: Selection | null; activeNote: string | null; onSelect: (s: Selection) => void; onNote: (id: string) => void; onCount: (n: number) => void; onError: (s: string) => void };
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const position = (r: Rect) => ({ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%` });

export default function PdfPage({ bytes, pageNumber, zoom, mode, notes, selection, activeNote, onSelect, onNote, onCount, onError }: Props) {
  const host = useRef<HTMLDivElement>(null); const page = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null); const textContainer = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [availableWidth, setAvailableWidth] = useState(700);
  const [size, setSize] = useState({ width: 600, height: 780 });
  const [rendered, setRendered] = useState(false);
  const [crop, setCrop] = useState<Rect | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const callbacks = useRef({ onCount, onError }); callbacks.current = { onCount, onError };

  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(entries => setAvailableWidth(entries[0].contentRect.width));
    observer.observe(host.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let stopped = false; let task: ReturnType<typeof import('pdfjs-dist')['getDocument']> | undefined;
    setRendered(false); setDoc(null);
    void import('pdfjs-dist').then(async pdfjs => {
      if (stopped) return;
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', window.location.href).href;
      const base = new URL('.', window.location.href).href;
      task = pdfjs.getDocument({ data: bytes.slice(), cMapUrl: `${base}cmaps/`, cMapPacked: true, standardFontDataUrl: `${base}standard_fonts/`, wasmUrl: `${base}wasm/` });
      const loaded = await task.promise;
      if (!stopped) { setDoc(loaded); callbacks.current.onCount(loaded.numPages); }
    }).catch(error => { if (!stopped) callbacks.current.onError(/password/i.test(error.message) ? 'This PDF needs a password. Please choose an unlocked copy.' : 'This PDF could not be displayed. Try opening another file.'); });
    return () => { stopped = true; void task?.destroy(); };
  }, [bytes]);
  useEffect(() => {
    if (!doc || !canvas.current || !textContainer.current) return;
    let stopped = false; let renderTask: RenderTask | undefined; let layer: TextLayer | undefined;
    setRendered(false); setCrop(null);
    void (async () => {
      const pdfjs = await import('pdfjs-dist'); const pdfPage = await doc.getPage(pageNumber);
      if (stopped) return;
      const original = pdfPage.getViewport({ scale: 1 });
      const scale = Math.max(240, Math.min(availableWidth - 48, 920)) / original.width * zoom;
      const viewport = pdfPage.getViewport({ scale });
      setSize({ width: viewport.width, height: viewport.height });
      const target = canvas.current!; const container = textContainer.current!;
      const density = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(12_000_000 / (viewport.width * viewport.height)));
      target.width = Math.floor(viewport.width * density); target.height = Math.floor(viewport.height * density);
      target.style.width = `${viewport.width}px`; target.style.height = `${viewport.height}px`;
      container.replaceChildren(); container.style.setProperty('--scale-factor', String(scale));
      container.style.setProperty('--total-scale-factor', String(viewport.scale * viewport.userUnit));
      renderTask = pdfPage.render({ canvas: target, viewport, transform: density === 1 ? undefined : [density, 0, 0, density, 0, 0] });
      await renderTask.promise; if (stopped) return;
      layer = new pdfjs.TextLayer({ textContentSource: await pdfPage.getTextContent(), container, viewport });
      await layer.render(); if (!stopped) setRendered(true);
    })().catch(error => { if (!stopped && error.name !== 'RenderingCancelledException' && error.name !== 'AbortException') callbacks.current.onError('This page could not be rendered. Try another page or reopen the PDF.'); });
    return () => { stopped = true; renderTask?.cancel(); layer?.cancel(); };
  }, [doc, pageNumber, availableWidth, zoom]);

  function captureText() {
    if (mode !== 'text' || !rendered || !page.current || !textContainer.current) return;
    const selected = window.getSelection();
    if (!selected || selected.isCollapsed || !selected.rangeCount) return;
    const range = selected.getRangeAt(0);
    if (!textContainer.current.contains(range.startContainer) || !textContainer.current.contains(range.endContainer)) return;
    const text = selected.toString().trim().slice(0, 30000); if (!text) return;
    const bounds = page.current.getBoundingClientRect();
    const rects = Array.from(range.getClientRects()).filter(r => r.width > 1 && r.height > 1).map(r => ({ x: clamp((r.left - bounds.left) / bounds.width), y: clamp((r.top - bounds.top) / bounds.height), width: Math.min(r.width / bounds.width, 1), height: Math.min(r.height / bounds.height, 1) })).filter(r => r.x + r.width <= 1.01 && r.y + r.height <= 1.01);
    if (rects.length) onSelect({ page: pageNumber, kind: 'text', text, rects: rects.slice(0, 500) });
  }
  function coords(e: PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect(); return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  }
  function dragStart(e: PointerEvent<HTMLDivElement>) {
    if (!rendered || e.button !== 0) return;
    start.current = coords(e); setCrop(null); e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault();
  }
  function dragMove(e: PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const current = coords(e); setCrop({ x: Math.min(start.current.x, current.x), y: Math.min(start.current.y, current.y), width: Math.abs(start.current.x - current.x), height: Math.abs(start.current.y - current.y) });
  }
  function dragEnd(e: PointerEvent<HTMLDivElement>) {
    if (!start.current || !canvas.current) return;
    const current = coords(e); const origin = start.current; start.current = null;
    const r = { x: Math.min(origin.x, current.x), y: Math.min(origin.y, current.y), width: Math.abs(origin.x - current.x), height: Math.abs(origin.y - current.y) };
    setCrop(null); if (r.width * size.width < 8 || r.height * size.height < 8) return;
    const source = canvas.current; const cut = document.createElement('canvas');
    const sw = r.width * source.width, sh = r.height * source.height;
    const factor = Math.min(1, 1600 / Math.max(sw, sh));
    cut.width = Math.max(1, Math.round(sw * factor)); cut.height = Math.max(1, Math.round(sh * factor));
    cut.getContext('2d')!.drawImage(source, r.x * source.width, r.y * source.height, sw, sh, 0, 0, cut.width, cut.height);
    onSelect({ page: pageNumber, kind: 'area', text: '', rects: [r], image: cut.toDataURL('image/png') });
  }
  return <div ref={host} className="pdf-stage"><div ref={page} className={`pdf-page ${rendered ? '' : 'is-loading'}`} style={size} onPointerUp={() => { if (mode === 'text') requestAnimationFrame(captureText); }} onKeyUp={captureText}>
    <canvas ref={canvas} aria-label={`PDF page ${pageNumber}`}/><div ref={textContainer} className={`textLayer ${mode === 'area' ? 'inactive' : ''}`} tabIndex={0} aria-label="Selectable PDF text"/>
    <div className="annotations-layer">{notes.filter(n => n.selection.page === pageNumber).map(note => <div key={note.id}>{note.selection.rects.map((r, i) => <span key={i} style={position(r)} className={`highlight ${note.color} ${note.selection.kind === 'area' ? 'area-highlight' : ''} ${activeNote === note.id ? 'highlight-active' : ''}`}/>)}{note.selection.rects[0] && <button className={`note-pin ${note.color} ${activeNote === note.id ? 'active-pin' : ''}`} style={{ left: `${Math.min(.95, note.selection.rects[0].x + note.selection.rects[0].width) * 100}%`, top: `${note.selection.rects[0].y * 100}%` }} title={note.question || note.answer.slice(0, 100)} aria-label={`Open note on page ${pageNumber}: ${(note.question || note.answer).slice(0, 80)}`} onClick={() => onNote(note.id)}><StickyNote size={16}/></button>}</div>)}{selection?.page === pageNumber && selection.rects.map((r, i) => <span key={`selection-${i}`} className={`highlight current-selection ${selection.kind === 'area' ? 'area-highlight' : ''}`} style={position(r)}/>)}</div>
    {mode === 'area' && <div className="crop-layer" role="img" aria-label="Drag to crop an area" onPointerDown={dragStart} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={() => { start.current = null; setCrop(null); }}>{crop && <span className="crop-box" style={position(crop)}/>}</div>}
    {!rendered && <div className="page-loading" role="status"><LoaderCircle className="spin" size={22}/>Opening page…</div>}
  </div></div>;
}
