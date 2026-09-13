// PDF.js exposes text in the document's stored reading order, with line endings.
export function pageText(items: unknown[]): string {
  const parts = items.flatMap(item => {
    if (!item || typeof item !== 'object' || !('str' in item) || typeof item.str !== 'string') return [];
    return [item.str + ('hasEOL' in item && item.hasEOL ? '\n' : ' ')];
  });
  return parts.join('').replace(/[ \t]+\n/g, '\n').trim();
}
