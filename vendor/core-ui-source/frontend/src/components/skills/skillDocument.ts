/**
 * SKILL.md ⇄ fields helpers for the power-mode raw editor.
 *
 * A skill is stored as structured fields (name, description, tools_required,
 * body_override). Power mode lets the user edit the whole file — YAML
 * frontmatter + markdown body — so we compose those fields into a SKILL.md
 * string and parse edits back out.
 *
 * We only round-trip the workspace-editable frontmatter keys (`name`,
 * `description`, `allowed-tools`). Unknown keys a user adds are ignored on
 * save (the backend only persists these fields); the markdown body is
 * everything after the frontmatter block.
 */

export interface SkillDocFields {
  name: string;
  description: string;
  tools: string[];
  body: string;
}

/** JSON double-quoting is a valid subset of YAML double-quoted scalars. */
function yamlQuote(value: string): string {
  return JSON.stringify(value ?? '');
}

function yamlUnquote(raw: string): string {
  const v = raw.trim();
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    try {
      return JSON.parse(v) as string;
    } catch {
      return v.slice(1, -1);
    }
  }
  return v;
}

/** Compose structured fields into a SKILL.md document (frontmatter + body). */
export function composeSkillDocument({ name, description, tools, body }: SkillDocFields): string {
  const lines: string[] = ['---'];
  lines.push(`name: ${name || ''}`);
  lines.push(`description: ${yamlQuote(description || '')}`);
  lines.push('spec: jv');
  if (tools.length > 0) {
    lines.push('allowed-tools:');
    for (const t of tools) lines.push(`  - ${t}`);
  } else {
    lines.push('allowed-tools: []');
  }
  lines.push('---');
  lines.push('');
  lines.push(body || '');
  return lines.join('\n');
}

/**
 * Parse a SKILL.md document back into fields. Tolerant: if there's no
 * frontmatter block, the whole string is treated as the body and the other
 * fields fall back to `prev`.
 */
export function parseSkillDocument(doc: string, prev: SkillDocFields): SkillDocFields {
  const normalized = (doc ?? '').replace(/\r\n/g, '\n');
  const fmMatch = normalized.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!fmMatch) {
    return { ...prev, body: normalized.replace(/^\s+/, '') };
  }

  const frontmatter = fmMatch[1];
  const body = normalized.slice(fmMatch[0].length).replace(/^\n+/, '');

  let name = prev.name;
  let description = prev.description;
  const tools: string[] = [];
  let inTools = false;

  for (const rawLine of frontmatter.split('\n')) {
    const line = rawLine.replace(/\s+$/, '');
    if (inTools) {
      const item = line.match(/^\s*-\s+(.*)$/);
      if (item) {
        const val = yamlUnquote(item[1]);
        if (val) tools.push(val);
        continue;
      }
      if (/^\s/.test(rawLine) && line.trim() === '') continue;
      inTools = false;
      // fall through to key parsing for this line
    }
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const value = kv[2];
    if (key === 'name') {
      name = yamlUnquote(value);
    } else if (key === 'description') {
      description = yamlUnquote(value);
    } else if (key === 'allowed-tools') {
      const inline = value.trim();
      if (inline === '' ) {
        inTools = true;
      } else if (inline.startsWith('[')) {
        // inline list: [a, b]
        inline
          .replace(/^\[/, '')
          .replace(/\]$/, '')
          .split(',')
          .map(s => yamlUnquote(s))
          .filter(Boolean)
          .forEach(t => tools.push(t));
      }
    }
  }

  return { name, description, tools, body };
}
