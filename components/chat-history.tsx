import { ArrowUpRight, MessageSquare, StickyNote, Trash2 } from 'lucide-react';
import { MODELS } from '@/lib/ai-config';
import type { Chat } from '@/lib/reader-types';
import { selectionCrops, selectionLabel } from '@/lib/crops';

type Props = { chats: Chat[]; loading: boolean; onDelete: (chat: Chat) => void; onClear: () => void; onOpen: (chat: Chat) => void; onPin: (chat: Chat) => void };
export default function ChatHistory({ chats, loading, onDelete, onClear, onOpen, onPin }: Props) {
  return <div className="chat-history">
    <div className="history-heading"><p>All chats with this PDF</p><button className="text-button" disabled={!chats.length || loading} onClick={onClear}><Trash2 size={13}/>Delete all</button></div>
    <p className="history-caption">Saved on this device. Use Save PDF + chats to take the history with you.</p>
    {loading ? <p role="status">Loading chats…</p> : !chats.length ? <div className="panel-empty"><span className="empty-icon"><MessageSquare size={26}/></span><h2>Your reading conversations.</h2><p>Questions and answers will appear here automatically, even when you don’t pin them as notes.</p></div> : chats.map((chat, index) => <article className="chat-entry" key={chat.id}>
      <div className="chat-meta"><span>{selectionLabel(chat.selection)}</span><time dateTime={chat.createdAt}>{new Date(chat.createdAt).toLocaleString()}</time><button aria-label={'Delete chat ' + (index + 1)} title="Delete this chat" onClick={() => onDelete(chat)}><Trash2 size={14}/></button></div>
      <details open={index === 0}><summary>{chat.question}</summary>
        <p className="chat-model">{MODELS.find(item => item.id === chat.model)?.label.split(' · ')[0] || chat.model}</p>
        {chat.selection.text && <blockquote>{chat.selection.text}</blockquote>}
        {selectionCrops(chat.selection).map((crop, index) => <figure className="saved-crop" key={index}><figcaption>Crop {index + 1} · PDF page {crop.page}</figcaption>{crop.image && <img src={crop.image} alt={`Saved crop ${index + 1} from page ${crop.page}`}/>}</figure>)}
        {chat.answer ? <p className="answer-text">{chat.answer}</p> : <p className="chat-status">{chat.status === 'pending' ? 'Waiting for an answer…' : chat.error || (chat.status === 'cancelled' ? 'Cancelled. No answer was saved.' : 'This request was interrupted before an answer was saved.')}</p>}
        <div className="chat-actions"><button className="text-button" onClick={() => onOpen(chat)}><ArrowUpRight size={13}/>{chat.flashcardCount !== undefined ? 'Study flashcards' : 'Open in reader'}</button>{chat.answer && !chat.flashcardCount && <button className="text-button" onClick={() => onPin(chat)}><StickyNote size={13}/>Pin answer</button>}</div>
      </details>
    </article>)}
  </div>;
}
