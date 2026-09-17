import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import 'katex/dist/katex.min.css';

type MarkdownNode = {
  type?: string;
  value?: string;
  children?: MarkdownNode[];
  data?: { hName?: string };
};

// OpenAI replies sometimes use LaTeX's \(...\) and \[...\] delimiters even
// when Markdown was requested. remark-math expects dollar delimiters, so
// normalize them while leaving escaped Markdown such as A\* and code intact.
export function normalizeAssistantMarkdown(text: string) {
  return text.replace(/\r\n?/g, '\n').split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`+[^`\n]*`+)/g).map((part, index) => {
    if (index % 2) return part;
    return part
      .replace(/\\\[([\s\S]*?)\\\]/g, (_match, math: string) => `\n\n$$\n${math.trim()}\n$$\n\n`)
      .replace(/\\\(([^\n]*?)\\\)/g, (_match, math: string) => `$${math}$`);
  }).join('');
}

// ==important text== is deliberately supported as a reader-friendly highlight.
// The node is converted to a real <mark> by mdast-util-to-hast; raw response
// HTML remains disabled by ReactMarkdown.
function remarkHighlights() {
  return (tree: MarkdownNode) => {
    const walk = (node: MarkdownNode) => {
      if (!node.children) return;
      node.children = node.children.flatMap(child => {
        if (child.type !== 'text' || !child.value?.includes('==')) {
          walk(child);
          return [child];
        }
        const output: MarkdownNode[] = [];
        const pattern = /==([^=\n]+)==/g;
        let start = 0; let match: RegExpExecArray | null;
        while ((match = pattern.exec(child.value))) {
          if (match.index > start) output.push({ type: 'text', value: child.value.slice(start, match.index) });
          output.push({ type: 'highlight', data: { hName: 'mark' }, children: [{ type: 'text', value: match[1] }] });
          start = match.index + match[0].length;
        }
        if (!output.length) return [child];
        if (start < child.value.length) output.push({ type: 'text', value: child.value.slice(start) });
        return output;
      });
    };
    walk(tree);
  };
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

const markdownComponents = {
  table: ({ children }: { children?: ReactNode }) => <div className="response-table-wrap"><table>{children}</table></div>,
  pre: ({ children }: { children?: ReactNode }) => <div className="response-code"><pre>{children}</pre></div>,
  a: ({ href, children }: { href?: string; children?: ReactNode }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
};

export default function RichResponse({ text, compact = false }: { text: string; compact?: boolean }) {
  return <div className={`assistant-response ${compact ? 'compact' : ''}`}>
    <div className="response-tools"><span>Select any part, or</span><CopyTextButton text={text}/></div>
    <div className="response-content">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath, remarkHighlights]} rehypePlugins={[rehypeKatex]} components={markdownComponents} skipHtml>
        {normalizeAssistantMarkdown(text)}
      </ReactMarkdown>
    </div>
  </div>;
}
