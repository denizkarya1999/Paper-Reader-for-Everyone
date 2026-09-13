import { useEffect, useRef, useState } from 'react';
import { BookOpen, Lightbulb, Upload, FileText, Archive, MessageSquare, Cat, Layers3, Highlighter, Scan, StickyNote, Sparkles, Download, Settings2, X, ChevronLeft, ChevronRight, Minus, Plus, Check, Trash2, LoaderCircle, FolderOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import type { Chat, Note, Paper, Selection } from '@/lib/reader-types';
import { addChat, chatCounts, clearChats, finishChat, listChats, listPapers, recoverInterruptedChats, removeChat, removePaper, restoreBundle, savePaper } from '@/lib/storage';
import PdfPage from '@/components/pdf-page';
import AskPanel, { type AnswerDraft } from '@/components/ask-panel';
import ConnectionDialog from '@/components/connection-dialog';
import ChatHistory from '@/components/chat-history';
import SettingsPage from '@/components/settings-page';
import AboutPage from '@/components/about-page';
import FlashcardsPage from '@/components/flashcards-page';
import ReadingSupportPage from '@/components/reading-support-page';
import { DEFAULT_SUPPORT, SUPPORT_LIMIT, SUPPORT_STORAGE_KEY, finishSupport, restoreSupport, supportHistory, supportPreferencesSchema, type SupportState, type SupportPayload } from '@/lib/reading-support';
import { MAX_FLASHCARDS, flashcardBatches } from '@/lib/flashcards';
import { APP_INFO, type Theme, type SettingsTab } from '@/lib/app-info';
import { parseQuiz, quizPrompt } from '@/lib/focus-types';
import { DEFAULT_MODEL, MAX_PAPER_BYTES, type ConnectionState, type AskPayload } from '@/lib/ai-config';

export default function Home() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [paper, setPaper] = useState<Paper | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [mode, setMode] = useState<'text' | 'area'>('text');
  const [zoom, setZoom] = useState(1);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [question, setQuestion] = useState('');
  const [draft, setDraft] = useState<AnswerDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [settings, setSettings] = useState(false);
  const [view, setView] = useState<'reader' | 'settings' | 'about' | 'flashcards' | 'support'>('reader');
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('appearance');
  const [theme, setTheme] = useState<Theme>(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  const [studyDeckId, setStudyDeckId] = useState('');
  const [supportInitial] = useState(() => {
    try { return { value: restoreSupport(localStorage.getItem(SUPPORT_STORAGE_KEY)), error: '' }; }
    catch { return { value: { preferences: DEFAULT_SUPPORT, entries: [] } as SupportState, error: 'Could not load focusing conversations from this device. New replies will remain available for this session. Clear the conversation to reset its saved data.' }; }
  });
  const [support, setSupport] = useState<SupportState>(supportInitial.value);
  const [supportStorageError, setSupportStorageError] = useState(supportInitial.error);
  const supportWritable = useRef(!supportInitial.error);
  useEffect(() => {
    if (!supportWritable.current || !supportPreferencesSchema.safeParse(support.preferences).success) return;
    try { localStorage.setItem(SUPPORT_STORAGE_KEY, JSON.stringify(support)); setSupportStorageError(''); }
    catch { setSupportStorageError('Could not save focusing conversations on this device. Replies are available for this session.'); }
  }, [support]);
  const [connection, setConnection] = useState<ConnectionState>({ hasKey: false, saved: false, model: DEFAULT_MODEL, canRemember: false });
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [scope, setScope] = useState<'selection' | 'paper'>('paper');
  const [tab, setTab] = useState<'ask' | 'notes' | 'chats'>('ask');
  const [chats, setChats] = useState<Chat[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [panel, setPanel] = useState(true);
  const [library, setLibrary] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [activeNote, setActiveNote] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<{ id: string; paperId: string; catToken?: string; support?: boolean } | null>(null);
  const currentPaper = useRef<Paper | null>(null); currentPaper.current = paper;
  const saveSequence = useRef(0);
  const historySequence = useRef(0);
  const quizHandler = useRef<(token: string) => Promise<void>>(async () => {});
  quizHandler.current = catQuiz;

  function openSettings(section: SettingsTab = 'appearance') { setSettingsTab(section); setView('settings'); }
  function changeTheme(value: Theme): string {
    setTheme(value); document.documentElement.dataset.theme = value;
    try { localStorage.setItem('paper-reader-theme', value); return (value === 'dark' ? 'Dark' : 'Light') + ' mode saved.'; }
    catch { return 'Theme applied. Device storage is unavailable, so this choice may not be remembered.'; }
  }
  useEffect(() => {
    if (view !== 'reader') document.getElementById(view === 'about' ? 'about-title' : view === 'settings' ? 'settings-title' : view === 'support' ? 'support-title' : 'flashcards-title')?.focus();
  }, [view]);

  async function refreshHistory() {
    const sequence = ++historySequence.current; const id = currentPaper.current?.id;
    setHistoryLoading(true);
    try {
      const [items, totals] = await Promise.all([id ? listChats(id) : Promise.resolve([]), chatCounts()]);
      if (sequence !== historySequence.current) return;
      setCounts(totals); if (currentPaper.current?.id === id) setChats(items);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load chat history.'); }
    finally { if (sequence === historySequence.current) setHistoryLoading(false); }
  }

  useEffect(() => {
    let alive = true;
    void recoverInterruptedChats().then(() => { if (alive) void refreshHistory(); }).catch(() => { if (alive) setError('Could not restore chat history from device storage.'); });
    if (window.paperReader) {
      window.paperReader.getConnection().then(value => {
        if (!alive) return;
        setConnection(value); setModel(value.model);
        if (!value.hasKey || value.error) setSettings(true);
      }).catch(() => { if (alive) { setError('Could not load your saved connection. Open Connection to set it up.'); setSettings(true); } });
    } else setSettings(true);
    listPapers().then(items => { if (alive) { setPapers(items); setHydrated(true); } }).catch(e => { if (alive) { setError(e.message); setHydrated(true); } });
    return () => { alive = false; if (request.current) { window.paperReader?.cancel(request.current.id); if (!request.current.support) void finishChat(request.current.paperId, request.current.id, { status: 'interrupted' }).catch(() => {}); } };
  }, []);
  useEffect(() => { setChats([]); void refreshHistory(); }, [paper?.id]);
  useEffect(() => { window.paperReader?.focusContext(paper?.id || null); }, [paper?.id]);
  useEffect(() => {
    const offReminder = window.paperReader?.onFocusReminder(token => { void quizHandler.current(token); });
    const offCancel = window.paperReader?.onFocusCancel(token => { if (request.current?.catToken === token) cancelQuestion(); });
    return () => { offReminder?.(); offCancel?.(); };
  }, []);
  useEffect(() => {
    if (!paper || !hydrated) return;
    const sequence = ++saveSequence.current; setStatus('Saving…');
    savePaper(paper).then(() => {
      if (sequence === saveSequence.current) setStatus('Saved on this device');
      setPapers(items => [paper, ...items.filter(item => item.id !== paper.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    }).catch(e => { if (sequence === saveSequence.current) { setStatus('Not saved'); setError(e.message); } });
  }, [paper, hydrated]);

  function cancelQuestion() {
    const pending = request.current; request.current = null; setBusy(false);
    if (pending) {
      window.paperReader?.cancel(pending.id);
      if (pending.support) { setSupport(value => ({ ...value, entries: finishSupport(value.entries, pending.id, { status: 'cancelled' }) })); return; }
      if (pending.catToken) void window.paperReader?.focusReply({ token: pending.catToken, error: 'Quiz cancelled. Come back to your paper when you’re ready.' }).catch(() => {});
      void finishChat(pending.paperId, pending.id, { status: 'cancelled' }).then(refreshHistory).catch(() => setError('The cancellation could not be saved in chat history.'));
    }
  }
  function choosePaper(item: Paper) {
    cancelQuestion(); setView('reader'); setPaper(item); setScope('paper'); setSelection(null); setDraft(null); setQuestion(''); setActiveNote(null); setLibrary(false); setPageCount(0); setZoom(1); setError('');
  }
  function updateNotes(notes: Note[]) { setPaper(item => item ? { ...item, notes, updatedAt: new Date().toISOString() } : item); }
  async function openFile(file?: File) {
    if (!file || opening) return;
    setError(''); setOpening(true);
    try {
      if (file.name.toLowerCase().endsWith('.zip')) {
        if (file.size > 200_000_000) throw new Error('Choose a saved bundle smaller than 200 MB.');
        const { importBundle } = await import('@/lib/paper-bundle');
        const imported = await importBundle(new Uint8Array(await file.arrayBuffer()));
        const existing = papers.find(item => item.id === imported.paper.id);
        const restored = existing || imported.paper;
        await restoreBundle(restored, imported.chats);
        choosePaper(restored); setTab('chats'); setPanel(true); await refreshHistory();
        return;
      }
      if (!file.name.toLowerCase().endsWith('.pdf')) throw new Error('Choose a PDF or a saved Paper Reader ZIP bundle.');
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
  function pickSelection(value: Selection) { if (busy) return; setSelection(value); setScope('selection'); setDraft(null); setTab('ask'); setPanel(true); setActiveNote(null); }
  function changeScope(value: 'selection' | 'paper') {
    if (busy) return;
    setScope(value === 'selection' && selection ? 'selection' : 'paper'); setDraft(null); setError(''); setTab('ask'); setPanel(true);
  }
  function noteSelection(): Selection | null {
    return scope === 'paper' || !selection ? { page: 1, kind: 'paper', text: '', rects: [{ x: .87, y: .05, width: .03, height: .03 }] } : selection;
  }
  async function askForSupport(question: string) {
    const asked = question.trim(); const preferences = supportPreferencesSchema.safeParse(support.preferences);
    if (!asked || asked.length > 4000 || !preferences.success || busy || request.current) return;
    if (support.entries.length >= SUPPORT_LIMIT) { setError('Clear the focusing conversation before starting another.'); return; }
    if (!connection.hasKey) { setSettings(true); return; }
    const bridge = window.paperReader;
    if (!bridge) { setError('ChatGPT is available in the installed desktop app.'); return; }
    const id = crypto.randomUUID(); const chosenModel = model as SupportPayload['model'];
    const history = supportHistory(support.entries);
    request.current = { id, paperId: '', support: true }; setBusy(true); setError('');
    setSupport(value => ({ ...value, entries: [...value.entries, { id, question: asked, answer: '', preferences: preferences.data, model: chosenModel, createdAt: new Date().toISOString(), status: 'pending' }] }));
    try {
      const result = await bridge.ask({ id, scope: 'support', question: asked, model: chosenModel, preferences: preferences.data, history });
      if (request.current?.id !== id) return;
      if (result.error) throw new Error(result.error);
      if (!result.answer?.trim()) throw new Error('No reply was returned. Please try again.');
      const answer = result.answer + (result.incomplete ? '\n\n[Reply reached the length limit. Ask a follow-up for more.]' : '');
      setSupport(value => ({ ...value, entries: finishSupport(value.entries, id, { status: 'completed', answer: answer.slice(0, 20000) }) }));
    } catch (e) {
      if (request.current?.id === id) setSupport(value => ({ ...value, entries: finishSupport(value.entries, id, { status: 'error', error: e instanceof Error ? e.message : 'Could not get reading support. Please try again.' }) }));
    } finally { if (request.current?.id === id) { request.current = null; setBusy(false); } }
  }
  function deleteSupport(id?: string) {
    if (!window.confirm(id ? 'Delete this focusing question and reply from this device?' : 'Clear the focusing conversation and its saved data from this device? Your PDF chats will remain.')) return;
    if (request.current?.support && (!id || request.current.id === id)) cancelQuestion();
    supportWritable.current = true;
    setSupport(value => ({ preferences: supportPreferencesSchema.safeParse(value.preferences).success ? value.preferences : DEFAULT_SUPPORT, entries: id ? value.entries.filter(entry => entry.id !== id) : [] }));
  }
  async function ask(override?: string) {
    const selected = noteSelection(); const asked = (override ?? question).trim();
    if (!selected || !asked || busy || request.current || !paper) return;
    if (override) setQuestion(override);
    if (!connection.hasKey) { setSettings(true); return; }
    if (!window.paperReader) { setError('ChatGPT is available in the installed desktop app.'); return; }
    const source = paper; const chosenModel = model;
    const id = crypto.randomUUID(); request.current = { id, paperId: source.id }; setBusy(true); setDraft(null); setError('');
    try {
      await addChat({ id, paperId: source.id, question: asked, answer: '', selection: selected, model: chosenModel, createdAt: new Date().toISOString(), status: 'pending' });
      void refreshHistory();
      if (request.current?.id !== id || currentPaper.current?.id !== source.id) return;
      if (source.bytes.length > MAX_PAPER_BYTES) throw new Error('Reading requires a PDF smaller than 50 MB.');
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not prepare this PDF. Please try again.'));
        reader.readAsDataURL(new Blob([new Uint8Array(source.bytes)], { type: 'application/pdf' }));
      });
      if (request.current?.id !== id || currentPaper.current?.id !== source.id) return;
      const context = { question: asked, model: chosenModel, pdf: { filename: source.name.slice(0, 240).replace(/\.pdf$/i, '') + '.pdf', data } };
      const payload: AskPayload = selected.kind === 'paper' ? { ...context, scope: 'paper' } : { ...context, scope: 'selection', text: selected.text, image: selected.image, page: selected.page };
      const result = await window.paperReader.ask({ id, ...payload });
      if (request.current?.id !== id || currentPaper.current?.id !== source.id) return;
      if (result.error) throw new Error(result.error);
      const answer = (result.answer || '') + (result.incomplete ? '\n\n[Answer reached the length limit.]' : '');
      try { await finishChat(source.id, id, { status: 'completed', answer }); }
      catch { setError('This answer could not be saved in chat history. Pin it and save the PDF to keep a copy.'); }
      if (request.current?.id !== id || currentPaper.current?.id !== source.id) return;
      setDraft({ answer, question: asked, selection: selected, model: chosenModel, chatId: id }); void refreshHistory();
    } catch (e) {
      if (request.current?.id === id) {
        const message = e instanceof Error ? e.message : 'Connection interrupted. Please try again.'; setError(message);
        await finishChat(source.id, id, { status: 'error', error: message }).catch(() => {});
        void refreshHistory();
      }
    }
    finally { if (request.current?.id === id) { setBusy(false); request.current = null; } }
  }
  async function catQuiz(token: string) {
    const bridge = window.paperReader; const source = currentPaper.current;
    if (!bridge) return;
    const reply = (value: { error?: string; question?: string; answer?: string; source?: string }) => bridge.focusReply({ token, ...value }).catch(() => false);
    if (!source) { await reply({ error: 'Open a PDF to try a quiz.' }); return; }
    if (request.current || busy) { await reply({ error: 'You already have a question in progress. I’ll try again at the next reminder.' }); return; }
    if (!connection.hasKey) { await reply({ error: 'Add your API key in Connection to enable PDF quizzes.' }); return; }
    const id = 'cat-' + token; const chosenModel = model;
    request.current = { id, paperId: source.id, catToken: token }; setBusy(true);
    const selected: Selection = { page: source.page, kind: 'paper', text: '', rects: [{ x: .87, y: .05, width: .03, height: .03 }] };
    try {
      await addChat({ id, paperId: source.id, question: '[Cat quiz] Create a recall question about this paper.', answer: '', selection: selected, model: chosenModel, createdAt: new Date().toISOString(), status: 'pending' });
      void refreshHistory();
      if (source.bytes.length > MAX_PAPER_BYTES) throw new Error('Quizzes need a PDF smaller than 50 MB.');
      const previous = (await listChats(source.id)).filter(chat => chat.status === 'completed' && chat.question.startsWith('[Cat quiz]')).map(chat => chat.question);
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Could not prepare this PDF.'));
        reader.readAsDataURL(new Blob([new Uint8Array(source.bytes)], { type: 'application/pdf' }));
      });
      if (request.current?.id !== id || currentPaper.current?.id !== source.id) return;
      const result = await bridge.ask({ id, scope: 'paper', model: chosenModel, question: quizPrompt(source.page, previous), pdf: { filename: source.name.slice(0, 240).replace(/\.pdf$/i, '') + '.pdf', data } });
      if (request.current?.id !== id || currentPaper.current?.id !== source.id) return;
      if (result.error) throw new Error(result.error);
      if (result.incomplete) throw new Error('The quiz answer was incomplete. Try again at the next reminder.');
      const quiz = parseQuiz(result.answer || '');
      await finishChat(source.id, id, { status: 'completed', question: '[Cat quiz] ' + quiz.question, answer: quiz.answer });
      if (request.current?.id !== id) return;
      await reply({ ...quiz, source: source.name.slice(0, 255) });
      void refreshHistory();
    } catch (e) {
      if (request.current?.id === id) {
        const message = (e instanceof Error ? e.message : 'Could not make a quiz right now.').slice(0, 4000);
        await finishChat(source.id, id, { status: 'error', error: message }).catch(() => {});
        await reply({ error: message }); void refreshHistory();
      }
    } finally { if (request.current?.id === id) { request.current = null; setBusy(false); } }
  }
  function pinDraft() {
    if (!paper || !draft) return;
    pinAnswer(draft);
  }
  async function generateFlashcards(count: number) {
    const bridge = window.paperReader; const source = currentPaper.current;
    if (!source || busy || request.current || !Number.isInteger(count) || count < 1 || count > MAX_FLASHCARDS || !pageCount) return;
    if (!connection.hasKey) { setSettings(true); return; }
    if (!bridge) { setError('Generate flashcards in the installed Linux app.'); return; }
    const id = crypto.randomUUID(); const chosenModel = model; const pages = pageCount;
    request.current = { id, paperId: source.id }; setBusy(true); setError('');
    try {
      await addChat({ id, paperId: source.id, question: `[Flashcards] Generate ${count} questions with answers.`, answer: '', flashcards: [], flashcardCount: count, selection: { kind: 'paper', page: 1, text: '', rects: [{ x: .87, y: .05, width: .03, height: .03 }] }, model: chosenModel, createdAt: new Date().toISOString(), status: 'pending' });
      void refreshHistory();
      if (source.bytes.length > MAX_PAPER_BYTES) throw new Error('Flashcards need a PDF smaller than 50 MB.');
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Could not prepare this PDF.'));
        reader.readAsDataURL(new Blob([new Uint8Array(source.bytes)], { type: 'application/pdf' }));
      });
      const batches = flashcardBatches({ count, pages, isActive: () => request.current?.id === id && currentPaper.current?.id === source.id,
        send: question => bridge.ask({ id, scope: 'paper', model: chosenModel, question, pdf: { filename: source.name.slice(0, 240).replace(/\.pdf$/i, '') + '.pdf', data } }),
      });
      for await (const cards of batches) {
        const saved = await finishChat(source.id, id, { status: cards.length === count ? 'completed' : 'pending', flashcards: cards, answer: `${cards.length} of ${count} flashcards saved. Open Flashcards to study this set.` });
        if (!saved) return;
        await refreshHistory();
      }
    } catch (e) {
      if (request.current?.id === id) {
        const message = (e instanceof Error ? e.message : 'Could not generate flashcards.').slice(0, 4000);
        setError(message); await finishChat(source.id, id, { status: 'error', error: message }).catch(() => {}); void refreshHistory();
      }
    } finally { if (request.current?.id === id) { request.current = null; setBusy(false); } }
  }
  function pinAnswer(value: AnswerDraft) {
    if (!paper) return;
    const note: Note = { id: crypto.randomUUID(), selection: value.selection, question: value.question, answer: value.answer, color: 'yellow', createdAt: new Date().toISOString() };
    setPaper(item => item ? { ...item, notes: [...item.notes, note], page: note.selection.page, updatedAt: new Date().toISOString() } : item);
    setDraft(null); setQuestion(''); setTab('notes'); setActiveNote(note.id);
  }
  function openChat(chat: Chat) {
    cancelQuestion(); setScope(chat.selection.kind === 'paper' ? 'paper' : 'selection'); setSelection(chat.selection.kind === 'paper' ? null : chat.selection);
    setPaper(item => item ? { ...item, page: chat.selection.page } : item);
    setQuestion(chat.question); setDraft(chat.answer ? { ...chat, chatId: chat.id } : null); setTab('ask'); setPanel(true); setError('');
  }
  async function deleteChat(chat: Chat) {
    if (request.current?.id === chat.id) cancelQuestion();
    try { await removeChat(chat.paperId, chat.id); if (draft?.chatId === chat.id) setDraft(null); await refreshHistory(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not delete this chat.'); }
  }
  async function deleteHistory(allPapers = false) {
    if (!allPapers && !paper) return;
    if (!window.confirm(allPapers ? 'Delete all chat history and flashcard sets for every PDF on this device? PDFs, pinned notes, and previously saved ZIP bundles will remain.' : 'Delete all chats and flashcard sets for this PDF on this device? The PDF, pinned notes, and previously saved ZIP bundles will remain.')) return;
    cancelQuestion();
    try { await clearChats(allPapers ? undefined : paper!.id); setDraft(null); await refreshHistory(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not delete chat history.'); }
  }
  async function downloadBundle() {
    if (!paper || exporting || busy) return;
    const source = paper; setExporting(true); setError('');
    try {
      const { exportBundle } = await import('@/lib/paper-bundle');
      const bytes = await exportBundle(source, await listChats(source.id));
      const name = source.name.replace(/\.pdf$/i, '') + ' - PDF and chats.zip';
      if (window.paperReader) await window.paperReader.saveBundle({ name, bytes });
      else {
        const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/zip' }));
        const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30_000);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the PDF and chats bundle.'); }
    finally { setExporting(false); }
  }
  function addOwnNote() {
    const selected = noteSelection();
    if (!selected || !paper) return;
    const note: Note = { id: crypto.randomUUID(), selection: selected, question: '', answer: question.trim() || 'Write your note here…', color: 'yellow', createdAt: new Date().toISOString() };
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
    <input ref={input} type="file" accept="application/pdf,application/zip,.pdf,.zip" hidden onChange={e => void openFile(e.target.files?.[0])}/>
    <header className="app-header"><button className="brand" onClick={() => setLibrary(true)} aria-label="Paper Reader for Everyone — open library"><span className="brand-mark"><BookOpen size={22}/></span><span className="brand-title">{APP_INFO.name}</span><span className="version">{APP_INFO.version}</span></button><div className="header-actions"><button className="button quiet" aria-label="Focusing Tips for Readers" aria-current={view === 'support' ? 'page' : undefined} onClick={() => setView('support')}><Lightbulb size={17}/><span>Focusing tips</span></button><button className="button quiet" onClick={() => openSettings('cat')} aria-label="Focus cat"><Cat size={17}/><span>Focus cat</span></button><button className="button quiet" aria-label="My PDFs" onClick={() => setLibrary(true)}><FolderOpen size={17}/><span>My PDFs</span></button><button className="button quiet" aria-current={view === 'settings' ? 'page' : undefined} onClick={() => openSettings()} aria-label="Settings"><Settings2 size={17}/><span>Settings</span></button><button className="button primary" onClick={() => void browse()} disabled={opening}>{opening ? <LoaderCircle className="spin" size={17}/> : <Plus size={18}/>}<span>Open PDF</span></button></div></header>
    {error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={17}/></button></div>}
    <div className="reading-space" hidden={view !== 'reader'}>
    {!paper ? <section className="welcome"><div className="welcome-heading"><span className="eyebrow">YOUR READING SPACE</span><h1>A little clarity.<br/>In the margins.</h1><p>Read a paper. Ask a question.<br/>Keep the insight right where you found it.</p></div><div className="upload-card"><div className="file-symbol"><FileText size={32} strokeWidth={1.5}/><span><Plus size={14}/></span></div><h2>Start with a PDF</h2><p>Drop a PDF or a saved PDF + chats ZIP here.</p><button className="button primary large" onClick={() => void browse()} disabled={opening || !hydrated}>{opening ? <LoaderCircle className="spin" size={18}/> : <Upload size={18}/>} {opening ? 'Opening PDF…' : 'Choose PDF'}</button><small>PDF up to 50 MB · ZIP bundle up to 200 MB</small><button className="example-link" onClick={() => void openExample()} disabled={opening || !hydrated}>Or try an example <ChevronRight size={15}/></button></div><div className="how-it-works"><div><Highlighter size={19}/><strong>01</strong><span>Highlight a passage</span></div><div><Sparkles size={19}/><strong>02</strong><span>Ask ChatGPT</span></div><div><StickyNote size={19}/><strong>03</strong><span>Pin the answer</span></div></div>{papers.length > 0 && <div className="recent"><h2>Pick up where you left off</h2>{papers.slice(0, 3).map(item => <button key={item.id} className="recent-paper" onClick={() => choosePaper(item)}><FileText size={21}/><span>{item.name}<small>{item.notes.length} notes · {new Date(item.updatedAt).toLocaleDateString()}</small></span><ChevronRight size={18}/></button>)}</div>}</section> : <>
      <div className="document-bar"><div className="document-name"><FileText size={18}/><span title={paper.name}>{paper.name}</span><small><Check size={13}/>{status}</small></div><div className="document-actions"><button className="button" aria-label="Flashcards" onClick={() => { setStudyDeckId(''); setView('flashcards'); void refreshHistory(); }}><Layers3 size={16}/><span>Flashcards</span></button><button className="button" aria-label="Summarize paper" disabled={busy} onClick={() => changeScope('paper')}><Sparkles size={16}/><span>Summarize paper</span></button><button className="button" aria-label="Save PDF" onClick={() => void downloadPdf()} disabled={exporting}>{exporting ? <LoaderCircle className="spin" size={16}/> : <Download size={16}/>}<span>Save PDF</span></button><button className="button" aria-label="Save PDF and chats" title="Save PDF + chats as a ZIP bundle" disabled={exporting || busy} onClick={() => void downloadBundle()}><Archive size={16}/><span>Save PDF + chats</span></button></div></div>
      <div className={`workspace ${panel ? '' : 'panel-hidden'}`}><section className="reader" aria-label="PDF reader"><div className="toolbar"><div className="tool-group"><button className={mode === 'text' ? 'tool active' : 'tool'} aria-pressed={mode === 'text'} onClick={() => setMode('text')}><Highlighter size={16}/><span>Highlight</span></button><button className={mode === 'area' ? 'tool active' : 'tool'} aria-pressed={mode === 'area'} onClick={() => setMode('area')}><Scan size={16}/><span>Crop area</span></button></div><div className="page-controls"><button aria-label="Previous page" disabled={paper.page <= 1} onClick={() => changePage(paper.page - 1)}><ChevronLeft size={17}/></button><label><span className="sr-only">Page number</span><input key={`${paper.id}-${paper.page}`} type="number" min="1" max={pageCount || 1} defaultValue={paper.page} onBlur={e => changePage(Number(e.target.value) || 1)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}/></label><span>/ {pageCount || '…'}</span><button aria-label="Next page" disabled={!pageCount || paper.page >= pageCount} onClick={() => changePage(paper.page + 1)}><ChevronRight size={17}/></button></div><div className="zoom-controls"><button aria-label="Zoom out" disabled={zoom <= .6} onClick={() => setZoom(z => Math.max(.6, +(z - .2).toFixed(1)))}><Minus size={16}/></button><button className="zoom-value" onClick={() => setZoom(1)} title="Fit to width">{Math.round(zoom * 100)}%</button><button aria-label="Zoom in" disabled={zoom >= 2} onClick={() => setZoom(z => Math.min(2, +(z + .2).toFixed(1)))}><Plus size={16}/></button></div><button className="panel-toggle" aria-label={panel ? 'Hide notes panel' : 'Show notes panel'} onClick={() => setPanel(!panel)}>{panel ? <PanelRightClose size={18}/> : <PanelRightOpen size={18}/>}</button></div><div className="page-scroll"><PdfPage bytes={paper.bytes} pageNumber={paper.page} zoom={zoom} mode={mode} notes={paper.notes} selection={scope === 'selection' ? selection : null} activeNote={activeNote} onSelect={pickSelection} onNote={id => { setActiveNote(id); setTab('notes'); setPanel(true); }} onCount={setPageCount} onError={setError}/></div><div className="reader-hint">{mode === 'text' ? 'Drag across text to highlight a passage.' : 'Drag a rectangle around a figure, equation, or passage.'}<span>Your original PDF stays intact.</span></div></section>
      {panel && <aside className="side-panel" aria-label="Questions and notes"><div className="panel-tabs"><button className={tab === 'ask' ? 'selected' : ''} onClick={() => setTab('ask')}><Sparkles size={17}/>Ask ChatGPT</button><button className={tab === 'chats' ? 'selected' : ''} onClick={() => { setTab('chats'); void refreshHistory(); }}><MessageSquare size={16}/>Chats <span className="count">{counts[paper.id] || 0}</span></button><button className={tab === 'notes' ? 'selected' : ''} onClick={() => setTab('notes')}><StickyNote size={17}/>Notes <span className="count">{noteCount}</span></button></div>{tab === 'ask' ? <AskPanel scope={scope} selection={selection} draft={draft} busy={busy} question={question} model={model} pageCount={pageCount} filename={paper.name} onScope={changeScope} onQuestion={setQuestion} onAsk={value => void ask(value)} onCancel={cancelQuestion} onClear={() => { setSelection(null); setScope('paper'); setDraft(null); }} onPin={pinDraft} onNote={addOwnNote} onSettings={() => openSettings('connection')}/> : tab === 'chats' ? <ChatHistory chats={chats} loading={historyLoading} onDelete={chat => void deleteChat(chat)} onClear={() => void deleteHistory()} onOpen={chat => { if (chat.flashcardCount !== undefined) { setStudyDeckId(chat.id); setView('flashcards'); } else openChat(chat); }} onPin={chat => pinAnswer({ ...chat, chatId: chat.id })}/> : <div className="notes-panel">{noteCount === 0 ? <div className="panel-empty"><span className="empty-icon yellow"><StickyNote size={28}/></span><h2>Keep the useful bits.</h2><p>Pin a ChatGPT answer or write your own note. Each one stays linked to its place in the PDF.</p></div> : <><p className="notes-caption">Your thoughts, right in the margins.</p>{paper.notes.map((note, index) => <article key={note.id} className={`sticky-card ${note.color} ${activeNote === note.id ? 'focused' : ''}`}><div className="sticky-top"><button onClick={() => { setPaper(item => item ? { ...item, page: note.selection.page } : item); setActiveNote(note.id); }}><StickyNote size={14}/>Note {index + 1}<span>{note.selection.kind === 'paper' ? '· Whole paper' : '· Page ' + note.selection.page}</span></button><button aria-label={`Delete note ${index + 1}`} onClick={() => updateNotes(paper.notes.filter(item => item.id !== note.id))}><Trash2 size={14}/></button></div>{note.question && <h3>{note.question}</h3>}{note.selection.text && <blockquote>{note.selection.text}</blockquote>}<textarea aria-label={`Edit note ${index + 1}`} value={note.answer} maxLength={20000} onChange={e => updateNotes(paper.notes.map(item => item.id === note.id ? { ...item, answer: e.target.value } : item))}/><div className="sticky-bottom"><span>{new Date(note.createdAt).toLocaleDateString()}</span><div className="color-options">{(['yellow', 'blue', 'pink'] as const).map(color => <button key={color} className={color} aria-label={`Make note ${index + 1} ${color}`} aria-pressed={note.color === color} onClick={() => updateNotes(paper.notes.map(item => item.id === note.id ? { ...item, color } : item))}>{note.color === color && <Check size={11}/>}</button>)}</div></div></article>)}</>}</div>}</aside>}
      </div></>}
    </div>
    {view === 'settings' && <SettingsPage tab={settingsTab} onTab={setSettingsTab} theme={theme} onTheme={changeTheme} connection={connection} onConnection={value => { setConnection(value); setModel(value.model); }} paperCount={papers.length} chatCount={Object.values(counts).reduce((sum, count) => sum + count, 0)} onClearHistory={() => void deleteHistory(true)} onBack={() => setView('reader')} onAbout={() => setView('about')}/>}
    {view === 'flashcards' && paper && <FlashcardsPage key={paper.id} initialDeckId={studyDeckId} filename={paper.name} decks={chats.filter(chat => chat.flashcardCount !== undefined)} busy={busy} model={model} pageCount={pageCount} onGenerate={count => void generateFlashcards(count)} onCancel={cancelQuestion} onDelete={chat => { if (window.confirm('Delete this flashcard set and its chat entry from this device? Saved ZIP copies and pinned notes remain.')) void deleteChat(chat); }} onPin={card => { pinAnswer({ question: card.question, answer: card.answer, model, selection: { kind: 'paper', page: card.page, text: '', rects: [{ x: .87, y: .05, width: .03, height: .03 }] } }); setView('reader'); setPanel(true); }} onPage={page => { changePage(page); setView('reader'); }} onBack={() => setView('reader')} onConnection={() => openSettings('connection')}/>}
    <div className="reading-space" hidden={view !== 'support'}>{supportStorageError && <p className="error-banner" role="alert">{supportStorageError}</p>}<ReadingSupportPage canReset={!!supportStorageError} preferences={support.preferences} entries={support.entries} busy={busy} pending={!!request.current?.support} model={model} onPreferences={preferences => setSupport(value => ({ ...value, preferences }))} onAsk={question => void askForSupport(question)} onCancel={cancelQuestion} onDelete={deleteSupport} onBack={() => setView('reader')} onConnection={() => openSettings('connection')}/></div>
    {view === 'about' && <AboutPage onBack={() => setView('reader')} onSettings={() => openSettings()}/>}
    <footer className="app-footer"><span>{APP_INFO.name} - Version {APP_INFO.version}</span><button onClick={() => setView('about')} aria-current={view === 'about' ? 'page' : undefined}>About Us</button><span>Made by {APP_INFO.developer}</span></footer>
    {settings && <ConnectionDialog connection={connection} onClose={() => setSettings(false)} onChange={value => { setConnection(value); setModel(value.model); }}/>}
    {library && <div className="modal-backdrop" onClick={() => setLibrary(false)}><section className="modal library-modal" role="dialog" aria-modal="true" aria-labelledby="library-title" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setLibrary(false); }}><button autoFocus className="modal-close" aria-label="Close library" onClick={() => setLibrary(false)}><X size={20}/></button><h2 id="library-title">My PDFs</h2><button className="text-button clear-all-history" disabled={!Object.values(counts).some(count => count > 0)} onClick={() => void deleteHistory(true)}><Trash2 size={13}/>Delete all chat history on this device</button><p>Saved on this device. Use Save PDF + chats to back up a PDF and its conversations together.</p>{papers.length ? papers.map(item => <div className="library-row" key={item.id}><button className="recent-paper" onClick={() => choosePaper(item)}><FileText size={20}/><span>{item.name}<small>{item.notes.length} notes · {counts[item.id] || 0} chats · Page {item.page}</small></span></button><button aria-label={`Remove ${item.name} from this device`} title="Remove from this device" onClick={() => { if (window.confirm(`Remove “${item.name}” and its notes and chats from this device? Save a PDF + chats bundle first to keep them.`)) { if (paper?.id === item.id) cancelQuestion(); void removePaper(item.id).then(() => { setPapers(items => items.filter(p => p.id !== item.id)); if (paper?.id === item.id) { setPaper(null); setSelection(null); setDraft(null); } void refreshHistory(); }).catch(e => setError(e.message)); } }}><Trash2 size={17}/></button></div>) : <p className="library-empty">Your next good read starts here.</p>}<button className="button primary" onClick={() => { setLibrary(false); void browse(); }}><Plus size={17}/>Open PDF</button></section></div>}
  </main>;
}
