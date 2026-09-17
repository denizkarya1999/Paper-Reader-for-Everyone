import { Check, Copy } from 'lucide-react';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';

function inline(text: string, keyPrefix: string): ReactNode[] {
  const tokens = text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|==[^=\n]+==|(?<!\*)\*[^*\n]+\*(?!\*)|(?<!_)_[^_\n]+_(?!_))/g);
  return tokens.filter(Boolean).map((token, index) => {
    const key = `${keyPrefix}-${index}`;
    if (token.startsWith('`') && token.endsWith('`')) return <code key={key}>{token.slice(1, -1)}</code>;
    if ((token.startsWith('**') && token.endsWith('**')) || (token.startsWith('__') && token.endsWith('__'))) return <strong key={key}>{token.slice(2, -2)}</strong>;
    if (token.startsWith('~~') && token.endsWith('~~')) return <del key={key}>{token.slice(2, -2)}</del>;
    if (token.startsWith('==') && token.endsWith('==')) return <mark key={key}>{token.slice(2, -2)}</mark>;
    if ((token.startsWith('*') && token.endsWith('*')) || (token.startsWith('_') && token.endsWith('_'))) return <em key={key}>{token.slice(1, -1)}</em>;
    return <Fragment key={key}>{token}</Fragment>;
  });
}

function cells(line: string) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(value => value.trim());
}

function render(text: string): ReactNode[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const output: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    const fence = line.match(/^\s*```([^`]*)$/);
    if (fence) {
      const code: string[] = []; index++;
      while (index < lines.length && !/^\s*```/.test(lines[index])) code.push(lines[index++]);
      if (index < lines.length) index++;
      output.push(<div className="response-code" key={`code-${index}`}>{fence[1].trim() && <span>{fence[1].trim()}</span>}<pre><code>{code.join('\n')}</code></pre></div>);
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = Math.min(4, heading[1].length + 1); const Tag = `h${level}` as 'h2' | 'h3' | 'h4' | 'h5';
      output.push(<Tag key={`heading-${index}`}>{inline(heading[2], `heading-${index}`)}</Tag>); index++; continue;
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { output.push(<hr key={`hr-${index}`}/>); index++; continue; }
    if (line.includes('|') && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1])) {
      const headings = cells(line); index += 2; const rows: string[][] = [];
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) rows.push(cells(lines[index++]));
      output.push(<div className="response-table-wrap" key={`table-${index}`}><table><thead><tr>{headings.map((value, cell) => <th key={cell}>{inline(value, `th-${index}-${cell}`)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{headings.map((_, cell) => <td key={cell}>{inline(row[cell] || '', `td-${index}-${rowIndex}-${cell}`)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^\s*>\s?/, ''));
      output.push(<blockquote key={`quote-${index}`}>{quote.map((value, quoteIndex) => <Fragment key={quoteIndex}>{quoteIndex > 0 && <br/>}{inline(value, `quote-${index}-${quoteIndex}`)}</Fragment>)}</blockquote>);
      continue;
    }
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      const orderedList = !!ordered; const items: string[] = [];
      const pattern = orderedList ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-*+]\s+(.+)$/;
      while (index < lines.length) { const match = lines[index].match(pattern); if (!match) break; items.push(match[1]); index++; }
      const List = orderedList ? 'ol' : 'ul';
      output.push(<List key={`list-${index}`}>{items.map((value, item) => <li key={item}>{inline(value, `list-${index}-${item}`)}</li>)}</List>);
      continue;
    }
    const paragraph: string[] = [line.trim()]; index++;
    while (index < lines.length && lines[index].trim() && !/^\s*(?:```|#{1,4}\s|>|[-*+]\s+|\d+[.)]\s+)/.test(lines[index])) {
      if (lines[index].includes('|') && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1])) break;
      paragraph.push(lines[index++].trim());
    }
    output.push(<p key={`paragraph-${index}`}>{inline(paragraph.join(' '), `paragraph-${index}`)}</p>);
  }
  return output;
}

async function copyText(text: string) {
  if (window.paperReader?.writeClipboard) { await window.paperReader.writeClipboard(text); return; }
  if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
  const field = document.createElement('textarea'); field.value = text; field.style.position = 'fixed'; field.style.opacity = '0';
  document.body.append(field); field.select(); document.execCommand('copy'); field.remove();
}

export async function readClipboard(): Promise<string> {
  if (window.paperReader?.readClipboard) return window.paperReader.readClipboard();
  return navigator.clipboard?.readText ? navigator.clipboard.readText() : '';
}

export function CopyTextButton({ text, label = 'Copy response' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false); const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  async function copy() {
    try { await copyText(text); setCopied(true); if (timer.current) window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setCopied(false), 1800); }
    catch { setCopied(false); }
  }
  return <button type="button" className="copy-response" aria-label={label} onClick={() => void copy()}>{copied ? <><Check size={13}/>Copied</> : <><Copy size={13}/>{label}</>}</button>;
}

export default function RichResponse({ text, compact = false }: { text: string; compact?: boolean }) {
  return <div className={`assistant-response ${compact ? 'compact' : ''}`}>
    <div className="response-tools"><span>Select any part, or</span><CopyTextButton text={text}/></div>
    <div className="response-content">{render(text)}</div>
  </div>;
}
