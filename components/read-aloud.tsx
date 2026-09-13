import { useEffect, useState } from 'react';
import { LoaderCircle, Pause, Play, Square, Volume2 } from 'lucide-react';
export type SpeechState = { id: string | null; status: 'idle' | 'loading' | 'playing' | 'paused' | 'error'; part: number; total: number; error?: string };
function useSpeechState() {
  const [state, setState] = useState<SpeechState>(() => window.readerSpeech?.getState() ?? { id: null, status: 'idle', part: 0, total: 0 });
  useEffect(() => window.readerSpeech?.subscribe(setState), []);
  return state;
}
export default function ReadAloud({ id, text, label = 'Read aloud' }: { id: string; text: string; label?: string }) {
  const state = useSpeechState();
  const active = state.id === id && ['loading', 'playing', 'paused'].includes(state.status);
  return <div className="read-aloud"><button className="text-button" type="button" disabled={!text.trim()} title="Natural AI voice · American English · uses OpenAI API credits" onClick={() => active ? window.readerSpeech?.stop() : void window.readerSpeech?.start(id, text)}>
    {active ? <Square size={14}/> : <Volume2 size={15}/>} {active ? 'Stop reading' : label}
  </button><small>AI voice · English (US)</small>{state.id === id && state.error && <span role="alert">{state.error}</span>}</div>;
}
export function SpeechStatus() {
  const state = useSpeechState();
  if (state.status === 'idle') return null;
  return <div className="speech-status" role="status">
    {state.status === 'loading' ? <LoaderCircle size={16} className="spin"/> : <Volume2 size={16}/>}
    <span>{state.status === 'error' ? state.error : `${state.status === 'loading' ? 'Preparing AI voice' : state.status === 'paused' ? 'Reading paused' : 'Reading aloud'} · American English · Part ${state.part} of ${state.total}`}</span>
    {['playing', 'paused'].includes(state.status) && <button onClick={() => window.readerSpeech?.pause()}>{state.status === 'paused' ? <Play size={14}/> : <Pause size={14}/>} {state.status === 'paused' ? 'Resume' : 'Pause'}</button>}
    <button onClick={() => window.readerSpeech?.stop()}><Square size={14}/>{state.status === 'error' ? 'Dismiss' : 'Stop'}</button>
  </div>;
}
