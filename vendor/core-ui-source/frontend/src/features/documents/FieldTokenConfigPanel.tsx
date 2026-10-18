import { Text } from '../../ui';

interface Props {
  token: Record<string, unknown> | null;
  onChange: (next: Record<string, unknown>) => void;
  onRemove: () => void;
}

export function FieldTokenConfigPanel({ token, onChange, onRemove }: Props) {
  if (!token) {
    return (
      <div className="doc-token-panel doc-token-panel--empty">
        <Text as="p" variant="body" tone="muted">
          Click a field token in the document to configure it.
        </Text>
      </div>
    );
  }

  return (
    <div className="doc-token-panel">
      <h3 className="text-sm font-semibold mb-2">Field token</h3>
      <label className="doc-token-panel__field">
        <span>Label</span>
        <input
          value={String(token.label || '')}
          onChange={e => onChange({ ...token, label: e.target.value })}
        />
      </label>
      <label className="doc-token-panel__field">
        <span>Field reference</span>
        <input
          value={
            String(token.fieldKey || '').includes('{{')
              ? String(token.fieldKey || '')
              : `{{${String(token.fieldKey || '')}}}`
          }
          readOnly
        />
      </label>
      <label className="doc-token-panel__field">
        <span>Format</span>
        <select
          value={String(token.format || 'default')}
          onChange={e => onChange({ ...token, format: e.target.value })}
        >
          <option value="default">Default</option>
          <option value="uppercase">UPPERCASE</option>
          <option value="lowercase">lowercase</option>
          <option value="titlecase">Title Case</option>
          <option value="iso">Date ISO</option>
          <option value="long">Date long</option>
          <option value="short">Date short</option>
          <option value="code_prefix">Currency code</option>
          <option value="symbol">Currency $</option>
        </select>
      </label>
      <label className="doc-token-panel__field">
        <span>Fallback</span>
        <input
          value={String(token.fallback || '')}
          onChange={e => onChange({ ...token, fallback: e.target.value })}
          placeholder="Optional"
        />
      </label>
      <label className="doc-token-panel__field">
        <span>If missing</span>
        <select
          value={String(token.missingPolicy || 'blank')}
          onChange={e => onChange({ ...token, missingPolicy: e.target.value })}
        >
          <option value="blank">Blank</option>
          <option value="fallback">Use fallback</option>
          <option value="warn">Warn</option>
          <option value="block">Block generation</option>
        </select>
      </label>
      <button type="button" className="doc-token-panel__remove" onClick={onRemove}>
        Remove field
      </button>
    </div>
  );
}
