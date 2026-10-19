import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { userSignaturesApi } from '../../api/userSignatures';
import { SignatureCanvas } from '../../components/signatures/SignatureCanvas';
import { Text } from '../../ui';

const ROLE_PRESETS = [
  { role: 'signature', label: 'Signature' },
  { role: 'author_signature', label: 'Author Signature' },
  { role: 'employee_signature', label: 'Employee Signature' },
  { role: 'employer_signature', label: 'Authorized Signatory' },
  { role: 'manager_signature', label: 'Manager Signature' },
  { role: 'witness_signature', label: 'Witness Signature' },
];

function pngB64FromDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

interface Props {
  block: Record<string, unknown> | null;
  onChange: (next: Record<string, unknown>) => void;
  onRemove: () => void;
}

export function SignatureBlockConfigPanel({ block, onChange, onRemove }: Props) {
  const [drawOpen, setDrawOpen] = useState(false);
  const sigQ = useQuery({
    queryKey: ['me-signatures'],
    queryFn: () => userSignaturesApi.list(),
  });
  const saved = sigQ.data?.[0];

  if (!block) {
    return (
      <div className="doc-token-panel doc-token-panel--empty">
        <Text as="p" variant="body" tone="muted">
          Click a signature block in the document to configure it.
        </Text>
      </div>
    );
  }

  const mode = String(block.mode || 'runtime');
  const previewB64 = String(block.embeddedPngB64 || '');

  const applyPreset = (role: string, label: string) => {
    onChange({ ...block, role, label });
  };

  const applySavedSignature = async () => {
    if (!saved) return;
    try {
      const embeddedPngB64 = await userSignaturesApi.downloadPngBase64(saved.id);
      onChange({
        ...block,
        mode: 'pre_embedded',
        embeddedAttachmentId: saved.id,
        embeddedPngB64,
      });
    } catch {
      /* caller may retry */
    }
  };

  return (
    <div className="doc-token-panel">
      <h3 className="text-sm font-semibold mb-2">Signature block</h3>
      <label className="doc-token-panel__field">
        <span>Mode</span>
        <select
          value={mode}
          onChange={e => {
            const nextMode = e.target.value;
            onChange({
              ...block,
              mode: nextMode,
              embeddedPngB64: nextMode === 'runtime' ? '' : block.embeddedPngB64,
            });
          }}
        >
          <option value="runtime">Runtime — signer fills when document is used</option>
          <option value="pre_embedded">Pre-embedded — baked into every generated PDF</option>
        </select>
      </label>
      <label className="doc-token-panel__field">
        <span>Role preset</span>
        <select
          value={String(block.role || 'signature')}
          onChange={e => {
            const preset = ROLE_PRESETS.find(p => p.role === e.target.value);
            if (preset) applyPreset(preset.role, preset.label);
            else onChange({ ...block, role: e.target.value });
          }}
        >
          {ROLE_PRESETS.map(p => (
            <option key={p.role} value={p.role}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="doc-token-panel__field">
        <span>Label</span>
        <input
          value={String(block.label || '')}
          onChange={e => onChange({ ...block, label: e.target.value })}
        />
      </label>
      {mode === 'pre_embedded' ? (
        <div className="space-y-2 mt-2">
          {previewB64 ? (
            <div className="rounded border border-[var(--panel-border)] bg-white p-2">
              <img
                src={`data:image/png;base64,${previewB64}`}
                alt="Embedded signature preview"
                className="max-h-12"
              />
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="text-sm text-[var(--accent)] underline"
              disabled={!saved || sigQ.isLoading}
              onClick={() => void applySavedSignature()}
            >
              Use my saved signature
            </button>
            <button
              type="button"
              className="text-sm text-[var(--accent)] underline"
              onClick={() => setDrawOpen(v => !v)}
            >
              {drawOpen ? 'Hide canvas' : 'Draw signature'}
            </button>
          </div>
          {drawOpen ? (
            <SignatureCanvas
              label="Draw signature for this block"
              onChange={dataUrl => {
                if (!dataUrl) return;
                onChange({
                  ...block,
                  mode: 'pre_embedded',
                  embeddedPngB64: pngB64FromDataUrl(dataUrl),
                  embeddedAttachmentId: '',
                });
              }}
            />
          ) : null}
        </div>
      ) : (
        <Text as="p" variant="body-sm" tone="muted" className="mt-2">
          Signers will draw or use a saved signature when this document is generated.
        </Text>
      )}
      <button type="button" className="doc-token-panel__remove mt-3" onClick={onRemove}>
        Remove signature block
      </button>
    </div>
  );
}
