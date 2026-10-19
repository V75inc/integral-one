/** Stored tag colors are optional. Invalid legacy values use neutral tokens. */
export function tagColorStyle(color?: string): React.CSSProperties | undefined {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return undefined;
  return { backgroundColor: `${color}24`, border: `1px solid ${color}`, color: 'var(--text)' };
}
