import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Square, Volume2 } from 'lucide-react';
import { pageText } from '@/lib/page-text';
export default function ReadPage({ bytes, pageNumber, paperId, onError }: { bytes: Uint8Array; pageNumber: number; paperId: string; onError: (message: string) => void }) {
  const id = `pdf-page-${paperId}-${pageNumber}`;
  const [preparing, setPreparing] = useState(false);
  const [speechId, setSpeechId] = useState<string | null>(null);
  const generation = useRef(0);
  const task = useRef<ReturnType<typeof import('pdfjs-dist')['getDocument']> | null>(null);
  useEffect(() => window.readerSpeech?.subscribe(state => {
    const active = ['loading', 'playing', 'paused'].includes(state.status); setSpeechId(active ? state.id : null);
    if (active && state.id !== id && task.current) { generation.current++; void task.current.destroy(); task.current = null; setPreparing(false); }
  }), [id]);
  useEffect(() => { setPreparing(false); return () => { generation.current++; void task.current?.destroy(); task.current = null; if (window.readerSpeech?.getState().id === id) window.readerSpeech.stop(); }; }, [id]);
  async function read() {
    if (preparing) { generation.current++; void task.current?.destroy(); task.current = null; setPreparing(false); return; }
    if (speechId === id) { window.readerSpeech?.stop(); return; }
    const token = ++generation.current; setPreparing(true); onError(''); window.readerSpeech?.stop();
    try {
      const pdfjs = await import('pdfjs-dist');
      if (token !== generation.current) return;
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', window.location.href).href;
      const base = new URL('.', window.location.href).href;
      const loading = pdfjs.getDocument({ data: bytes.slice(), cMapUrl: base + 'cmaps/', cMapPacked: true, standardFontDataUrl: base + 'standard_fonts/', wasmUrl: base + 'wasm/' }); task.current = loading;
      const doc = await loading.promise; const page = await doc.getPage(pageNumber);
      const text = pageText((await page.getTextContent()).items);
      let image: string | undefined;
      if (!text) {
        const original = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: 1600 / Math.max(original.width, original.height) });
        const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, viewport }).promise; image = canvas.toDataURL('image/png');
      }
      await loading.destroy(); if (task.current === loading) task.current = null;
      if (token === generation.current) await window.readerSpeech?.startPage(id, { text, image, label: `PDF page ${pageNumber}` });
    } catch (error) { if (token === generation.current) onError(error instanceof Error ? error.message : 'This page could not be prepared for reading.'); }
    finally { if (token === generation.current) { setPreparing(false); void task.current?.destroy(); task.current = null; } }
  }
  return <button className="tool" title="Read this page with an American English AI voice. Uses API credits. Scanned pages also use AI text recognition." aria-label={preparing ? 'Cancel preparing page audio' : speechId === id ? 'Stop reading this page' : 'Read this page aloud'} disabled={!pageNumber} onClick={() => void read()}>{preparing ? <LoaderCircle size={15} className="spin"/> : speechId === id ? <Square size={15}/> : <Volume2 size={15}/>}<span>{preparing ? 'Preparing page…' : speechId === id ? 'Stop page audio' : 'Read this page aloud'}</span></button>;
}
