import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ArrowUpRight, Circle, Highlighter, PenLine, Redo2, Trash2, Undo2, X } from 'lucide-react';
import { DRAWING_COLORS, MAX_STROKES, MAX_STROKE_POINTS, drawingSchema, paintStrokes } from '@/lib/drawing';
import type { Crop, DrawingPoint, DrawingStroke } from '@/lib/reader-types';

type Props = { crop: Crop; index: number; onSave: (crop: Crop) => void; onClose: () => void };
const tools = [{ id: 'pen', label: 'Pen', icon: PenLine }, { id: 'highlighter', label: 'Highlighter', icon: Highlighter }, { id: 'arrow', label: 'Arrow', icon: ArrowUpRight }, { id: 'ellipse', label: 'Circle', icon: Circle }] as const;

export default function CropEditor({ crop, index, onSave, onClose }: Props) {
  const [tool, setTool] = useState<DrawingStroke['tool']>('pen');
  const [color, setColor] = useState<string>(DRAWING_COLORS[0].value);
  const [size, setSize] = useState<'fine' | 'medium' | 'thick'>('medium');
  const [strokes, setStrokes] = useState<DrawingStroke[]>(crop.drawing?.strokes ?? []);
  const [redo, setRedo] = useState<DrawingStroke[][]>([]);
  const [undo, setUndo] = useState<DrawingStroke[][]>([]);
  const [draft, setDraft] = useState<DrawingStroke | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const active = useRef<{ id: number; stroke: DrawingStroke } | null>(null);
  const source = crop.drawing?.source ?? crop.image;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => { previous?.focus(); };
  }, []);
  useEffect(() => {
    let stopped = false;
    const loaded = new Image();
    loaded.onload = () => { if (!stopped) setImage(loaded); };
    loaded.onerror = () => { if (!stopped) setError('This crop image could not be opened. Select the area again.'); };
    if (source) loaded.src = source;
    else setError('This saved note has no crop image. Select the area again to draw on it.');
    return () => { stopped = true; };
  }, [source]);
  useEffect(() => {
    if (!canvas.current || !image) return;
    const target = canvas.current;
    target.width = image.naturalWidth; target.height = image.naturalHeight;
    const context = target.getContext('2d')!;
    context.drawImage(image, 0, 0);
    paintStrokes(context, [...strokes, ...(draft ? [draft] : [])], target.width, target.height);
  }, [image, strokes, draft]);

  function point(event: PointerEvent<HTMLCanvasElement>): DrawingPoint {
    const bounds = event.currentTarget.getBoundingClientRect();
    const clamp = (value: number) => Math.max(0, Math.min(1, value));
    return { x: clamp((event.clientX - bounds.left) / bounds.width), y: clamp((event.clientY - bounds.top) / bounds.height) };
  }
  function change(next: DrawingStroke[]) {
    setUndo(history => [...history.slice(-99), strokes]); setRedo([]); setStrokes(next); setError('');
  }
  function begin(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0 || active.current || !image) return;
    if (strokes.length >= MAX_STROKES) { setError(`This crop has ${MAX_STROKES} marks. Undo or clear a mark before drawing more.`); return; }
    const width = (tool === 'highlighter' ? .03 : .004) * ({ fine: .5, medium: 1, thick: 2 }[size]);
    const stroke = { tool, color, width, points: [point(event)] };
    active.current = { id: event.pointerId, stroke }; setDraft(stroke);
    event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault();
  }
  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (active.current?.id !== event.pointerId) return;
    const current = active.current.stroke;
    if (current.tool !== 'arrow' && current.tool !== 'ellipse' && current.points.length >= MAX_STROKE_POINTS) { setError('This line reached its limit. Release the pointer and start another line.'); return; }
    const points = current.tool === 'arrow' || current.tool === 'ellipse' ? [current.points[0], point(event)] : [...current.points, point(event)];
    const stroke = { ...current, points }; active.current.stroke = stroke; setDraft(stroke);
  }
  function end(event: PointerEvent<HTMLCanvasElement>) {
    if (active.current?.id !== event.pointerId) return;
    move(event); const stroke = active.current!.stroke;
    active.current = null; setDraft(null); change([...strokes, stroke]);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function cancelStroke() { active.current = null; setDraft(null); }
  function save() {
    if (!image || draft) return;
    try {
      const drawing = drawingSchema.parse({ source, width: image.naturalWidth, height: image.naturalHeight, strokes });
      const target = document.createElement('canvas'); target.width = drawing.width; target.height = drawing.height;
      const context = target.getContext('2d')!; context.drawImage(image, 0, 0);
      paintStrokes(context, strokes, target.width, target.height);
      const { drawing: _previous, ...original } = crop;
      onSave(strokes.length ? { ...original, image: target.toDataURL('image/png'), drawing } : { ...original, image: source });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save these drawings.'); }
  }
  return <div className="modal-backdrop crop-editor-backdrop" onDrop={e => e.stopPropagation()}>
    <section ref={dialog} className="crop-editor" role="dialog" aria-modal="true" aria-labelledby="crop-editor-title" tabIndex={-1} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); if (active.current) cancelStroke(); else onClose(); }
      if (event.key === 'Tab') {
        const buttons = Array.from(dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled), select, [tabindex="0"]'));
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <div className="crop-editor-heading"><div><h2 id="crop-editor-title">Draw on crop {index + 1}</h2><p>Page {crop.page} · Mark the details you want ChatGPT to focus on.</p></div><button aria-label="Close crop drawing" onClick={onClose}><X size={20}/></button></div>
      <div className="drawing-toolbar">
        <div role="group" aria-label="Drawing tool">{tools.map(item => <button key={item.id} aria-pressed={tool === item.id} onClick={() => { setTool(item.id); if (item.id === 'highlighter') setColor('#eab308'); else if (color === '#eab308') setColor('#dc2626'); }}><item.icon size={16}/>{item.label}</button>)}</div>
        <div className="drawing-colors" role="group" aria-label="Drawing color">{DRAWING_COLORS.map(item => <button key={item.value} aria-label={item.name + ' ink'} title={item.name} aria-pressed={color === item.value} style={{ '--ink-color': item.value } as React.CSSProperties} onClick={() => setColor(item.value)}/>)}</div>
        <label>Size <select aria-label="Drawing size" value={size} onChange={e => setSize(e.target.value as typeof size)}><option value="fine">Fine</option><option value="medium">Medium</option><option value="thick">Thick</option></select></label>
        <div role="group" aria-label="Drawing history"><button aria-label="Undo drawing" disabled={!undo.length || !!draft} onClick={() => { setRedo(history => [...history, strokes]); setStrokes(undo[undo.length - 1]); setUndo(history => history.slice(0, -1)); }}><Undo2 size={16}/></button><button aria-label="Redo drawing" disabled={!redo.length || !!draft} onClick={() => { setUndo(history => [...history, strokes]); setStrokes(redo[redo.length - 1]); setRedo(history => history.slice(0, -1)); }}><Redo2 size={16}/></button><button disabled={!strokes.length || !!draft} onClick={() => change([])}><Trash2 size={15}/>Clear drawing</button></div>
      </div>
      {error && <p className="drawing-error" role="alert">{error}</p>}
      <div className="drawing-workspace">{!image ? <p>Opening crop…</p> : <canvas ref={canvas} aria-label="Draw on the cropped image" onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={cancelStroke} onLostPointerCapture={cancelStroke}/>}</div>
      <div className="crop-editor-footer"><p>Your markings are included when you send this crop. Pin a note to keep them on the PDF.</p><span role="status" aria-live="polite">{strokes.length} {strokes.length === 1 ? 'mark' : 'marks'}</span><button className="button" onClick={onClose}>Cancel</button><button className="button primary" disabled={!image || !!draft} onClick={save}>Use marked crop</button></div>
    </section>
  </div>;
}
