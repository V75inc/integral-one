const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'BLOCKQUOTE', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5',
  'H6', 'LI', 'OL', 'P', 'PRE', 'UL',
]);

function safeHref(value: string): string | null {
  if (!value.trim()) return null;
  try {
    const url = new URL(value, window.location.href);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol)
      ? value.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\s/g, char => encodeURIComponent(char))
      : null;
  } catch {
    return null;
  }
}

function wrapInline(text: string, marker: string): string {
  return text.replace(/^(\s*)([\s\S]*?)(\s*)$/, (_, before, body, after) =>
    body ? `${before}${marker}${body}${marker}${after}` : text,
  );
}

function codeDelimiter(text: string, minimum: number): string {
  let width = minimum;
  for (const match of text.matchAll(/`+/g)) width = Math.max(width, match[0].length + 1);
  return '`'.repeat(width);
}

function render(node: Node, orderedIndex = 1): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/([\\`*_[\]<>])/g, '\\$1');
  if (!(node instanceof HTMLElement)) return '';
  const tag = node.tagName;
  if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(tag)) return '';
  if (tag === 'BR') return '  \n';
  if (tag === 'IMG') return node.getAttribute('alt') || '';
  // Render lists once. Rendering their children before this branch would
  // repeat the entire subtree at every nested list level.
  if (tag === 'UL' || tag === 'OL') {
    let index = Number(node.getAttribute('start')) || 1;
    let lastIndent = tag === 'OL' ? `${index}. `.length : 2;
    const parts = Array.from(node.childNodes).map(child => {
      if (child instanceof HTMLElement && child.tagName === 'LI') {
        const explicit = Number(child.getAttribute('value'));
        if (child.hasAttribute('value') && Number.isFinite(explicit)) index = explicit;
        lastIndent = tag === 'OL' ? `${index}. `.length : 2;
        return render(child, index++);
      }
      const content = render(child).trim();
      if (!content) return '';
      // Document clipboards may place a child list beside its parent LI.
      // Retain all readable children, nesting sibling lists under that item.
      return `${content.split('\n').map(line => ' '.repeat(lastIndent) + line).join('\n')}\n`;
    });
    return `\n${parts.join('')}\n`;
  }
  if (tag === 'PRE' || tag === 'CODE') {
    const text = node.textContent ?? '';
    const fence = codeDelimiter(text, tag === 'PRE' ? 3 : 1);
    if (tag === 'PRE') return `\n${fence}\n${text.replace(/\n$/, '')}\n${fence}\n`;
    const padding = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
    return `${fence}${padding}${text}${padding}${fence}`;
  }

  const children = Array.from(node.childNodes)
    .map(child => render(child, orderedIndex))
    .join('');
  const text = children.trim();
  if (!text && tag !== 'LI') return '';

  switch (tag) {
    case 'B':
    case 'STRONG': return node.style.fontWeight === 'normal' || (node.style.fontWeight && Number(node.style.fontWeight) < 600)
      ? children : wrapInline(children, '**');
    case 'I':
    case 'EM': return node.style.fontStyle === 'normal' ? children : wrapInline(children, '*');
    case 'S':
    case 'DEL':
    case 'STRIKE': return wrapInline(children, '~~');
    case 'A': {
      const href = safeHref(node.getAttribute('href') ?? '');
      return href ? children.replace(/^(\s*)([\s\S]*?)(\s*)$/, (_, before, label, after) =>
        `${before}[${label}](${href})${after}`,
      ) : children;
    }
    case 'BLOCKQUOTE': return `\n${text.split('\n').map(line => `> ${line}`).join('\n')}\n`;
    case 'H1':
    case 'H2':
    case 'H3':
    case 'H4':
    case 'H5':
    case 'H6': return `\n${'#'.repeat(Number(tag[1]))} ${text}\n`;
    case 'LI': {
      const parent = node.parentElement;
      const prefix = parent?.tagName === 'OL' ? `${orderedIndex}. ` : '- ';
      return `${prefix}${children.trim().replace(/\n/g, `\n${' '.repeat(prefix.length)}`)}\n`;
    }
    case 'P':
    case 'DIV':
    case 'ADDRESS':
    case 'ARTICLE': return `\n${text}\n`;
    default: {
      if (BLOCK_TAGS.has(tag)) return `\n${text}\n`;
      let inline = children;
      if (node.style.fontWeight === 'bold' || Number(node.style.fontWeight) >= 600) inline = wrapInline(inline, '**');
      if (node.style.fontStyle === 'italic') inline = wrapInline(inline, '*');
      if (node.style.textDecoration.includes('line-through')) inline = wrapInline(inline, '~~');
      return inline;
    }
  }
}

/** Convert clipboard HTML into the Markdown source used by chat messages. */
export function clipboardHtmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(doc.body.childNodes)
    .map(node => render(node))
    .join('')
    .trim();
}
