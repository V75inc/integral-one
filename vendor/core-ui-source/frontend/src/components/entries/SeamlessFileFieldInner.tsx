import { useContext, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Paperclip, X } from 'lucide-react';

import type { OperationalModelFieldSpec } from '../../types';
import {
  attachmentsApi,
  type AttachmentRecord,
} from '../../api/attachments';
import { publicSharingApi } from '../../api/sharing';
import { errorMessageFromAxios } from '../../api/helpers';
import { memberAssignedFormApi } from '../../features/memberAssignedForm/memberAssignedFormApi';
import { useToast } from '../../context/ToastContext';
import { LINE_ICON_STROKE } from '../ui/IconWell';
import { ExternalLabelContext } from './fieldLabelContext';

interface SeamlessFileFieldInnerProps {
  field: OperationalModelFieldSpec;
  value: unknown;
  onChange(value: unknown): void;
  many: boolean;
  readonly: boolean;
  entryId?: string;
  publicShare?: { token: string; entryId: string };
  memberFormUpload?: boolean;
}

interface UnifiedFileItem {
  id?: string;
  file?: File;
  name: string;
  pending?: boolean;
  failed?: boolean;
}

function isFileLike(item: unknown): item is File {
  return typeof File !== 'undefined' && item instanceof File;
}

function getUnifiedFiles(value: unknown, labels: Record<string, string>): UnifiedFileItem[] {
  if (value == null || value === '') return [];
  const list = Array.isArray(value) ? value : [value];
  const out: UnifiedFileItem[] = [];
  for (const item of list) {
    if (isFileLike(item)) {
      out.push({ file: item, name: item.name });
      continue;
    }
    if (item && typeof item === 'object') {
      const obj = item as { file?: unknown; name?: unknown; id?: unknown; filename?: unknown };
      if (isFileLike(obj.file)) {
        out.push({
          file: obj.file,
          name: typeof obj.name === 'string' ? obj.name : obj.file.name,
        });
        continue;
      }
      if (typeof obj.id === 'string') {
        const id = obj.id;
        out.push({
          id,
          name:
            labels[id]
            || (typeof obj.name === 'string' ? obj.name : '')
            || (typeof obj.filename === 'string' ? obj.filename : '')
            || 'Attachment',
        });
        continue;
      }
    }
    if (typeof item === 'string' && item.trim()) {
      const id = item.trim();
      out.push({ id, name: labels[id] || 'Attachment' });
    }
  }
  return out;
}

function filesFromValue(value: unknown): File[] {
  if (isFileLike(value)) return [value];
  if (!Array.isArray(value)) return [];
  return value.filter(isFileLike);
}

export function SeamlessFileFieldInner({
  field,
  value,
  onChange,
  many,
  readonly,
  entryId,
  publicShare,
  memberFormUpload,
}: SeamlessFileFieldInnerProps) {
  const { showToast } = useToast();
  // When the caller (entry detail grid / card) renders the field label, don't
  // repeat it here — otherwise the item shows e.g. "Media" twice.
  const externalLabel = useContext(ExternalLabelContext);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [localFiles, setLocalFiles] = useState<File[]>(() => filesFromValue(value));
  const [pendingNames, setPendingNames] = useState<string[]>([]);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const cfg = (field.config as Record<string, unknown> | undefined) ?? {};
  const accept = Array.isArray(cfg.accept) ? (cfg.accept as string[]) : [];
  const maxCount = typeof cfg.max_count === 'number'
    ? (cfg.max_count as number)
    : many
      ? 10
      : 1;

  const effectiveEntryId = publicShare?.entryId || entryId;
  const valueItems = getUnifiedFiles(value, labels);
  const localItems: UnifiedFileItem[] = localFiles.map(file => ({
    file,
    name: file.name,
  }));
  const pendingItems: UnifiedFileItem[] = pendingNames.map(name => ({
    name,
    pending: true,
  }));
  const items: UnifiedFileItem[] =
    valueItems.length > 0
      ? [...valueItems, ...pendingItems.filter(p => !valueItems.some(v => v.name === p.name))]
      : [...localItems, ...pendingItems];
  const ids = valueItems.map(x => x.id).filter(Boolean) as string[];

  useEffect(() => {
    const fromValue = filesFromValue(value);
    if (fromValue.length > 0) {
      setLocalFiles(fromValue);
      return;
    }
    if (typeof value === 'string' && value.trim()) {
      setLocalFiles([]);
      setPendingNames([]);
      return;
    }
    if (
      Array.isArray(value)
      && value.some(v => typeof v === 'string' && v.trim())
    ) {
      setLocalFiles([]);
      setPendingNames([]);
    }
  }, [value]);

  useEffect(() => {
    if (effectiveEntryId || readonly) return;
    if (!localFiles.length) return;
    const fromValue = filesFromValue(value);
    if (fromValue.length > 0) return;
    const hasIds =
      (typeof value === 'string' && value.trim().length > 0)
      || (Array.isArray(value)
        && value.some(v => typeof v === 'string' && Boolean(String(v).trim())));
    if (hasIds) return;
    onChangeRef.current(many ? localFiles : localFiles[0] ?? null);
  }, [value, localFiles, many, effectiveEntryId, readonly]);

  useEffect(() => {
    let cancelled = false;
    const missing = ids.filter(id => !labels[id]);
    if (!missing.length) return;
    (async () => {
      const next: Record<string, string> = {};
      if (memberFormUpload) {
        for (const id of missing) next[id] = id;
      } else if (publicShare?.token && publicShare.entryId) {
        try {
          const listed = await publicSharingApi.listPublicEntryAttachments(
            publicShare.token,
            publicShare.entryId,
          );
          for (const att of listed.attachments || []) {
            if (att.id) next[att.id] = att.filename || 'Attachment';
          }
        } catch {
          for (const id of missing) next[id] = id;
        }
      } else {
        await Promise.all(
          missing.map(async id => {
            try {
              const detail = await attachmentsApi.get(id);
              const att = detail.attachment as AttachmentRecord;
              next[id] = att.filename || 'Attachment';
            } catch {
              next[id] = id;
            }
          }),
        );
      }
      if (!cancelled) {
        setLabels(prev => ({ ...prev, ...next }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(ids), memberFormUpload, publicShare?.token, publicShare?.entryId]);

  const emitItems = (nextItems: UnifiedFileItem[]) => {
    const nextFiles = nextItems.map(i => i.file).filter(isFileLike);
    setLocalFiles(nextFiles);
    setPendingNames([]);
    const outputValues = nextItems.map(item => item.file || item.id).filter(Boolean);
    onChange(many ? outputValues : outputValues[0] ?? null);
  };

  const remove = (itemToRemove: UnifiedFileItem) => {
    if (readonly) return;
    const nextItems = items.filter(item => {
      if (itemToRemove.id && item.id) return item.id !== itemToRemove.id;
      if (itemToRemove.file && item.file) return item.file !== itemToRemove.file;
      if (itemToRemove.pending && item.pending && item.name === itemToRemove.name) {
        return false;
      }
      return true;
    });
    emitItems(nextItems);
  };

  const handleFiles = async (files: File[] | FileList | null) => {
    const picked = !files
      ? []
      : Array.isArray(files)
        ? files
        : Array.from(files);
    if (!picked.length) return;

    const available = maxCount - items.filter(i => !i.failed).length;
    if (available <= 0) {
      showToast(
        many
          ? `This field accepts at most ${maxCount} ${maxCount === 1 ? 'file' : 'files'}.`
          : 'This field accepts a single file. Remove it first to replace.',
        'error',
      );
      return;
    }
    const toUpload = picked.slice(0, available);

    setPendingNames(prev => [...prev, ...toUpload.map(f => f.name)]);
    setLocalFiles(prev => {
      const merged = many ? [...prev, ...toUpload] : [...toUpload];
      return merged.slice(-maxCount);
    });

    if (effectiveEntryId) {
      setUploading(true);
      const newIds: string[] = [];
      const uploadedNames: string[] = [];
      try {
        for (const file of toUpload) {
          try {
            const record = memberFormUpload
              ? await memberAssignedFormApi.uploadAttachment(file, {
                  fieldKey: field.key,
                  entryId: effectiveEntryId,
                })
              : publicShare?.token
                ? await publicSharingApi.uploadPublicEntryAttachment(
                    publicShare.token,
                    effectiveEntryId,
                    file,
                    { fieldKey: field.key },
                  )
                : await attachmentsApi.uploadForEntry(effectiveEntryId, file);
            const fieldValueFallback =
              'fieldValue' in record
                ? String((record as { fieldValue?: string }).fieldValue || '')
                : '';
            const attId = String(record.id || fieldValueFallback || '').trim();
            const displayName =
              ('filename' in record && record.filename) || file.name || attId || file.name;
            setPendingNames(prev => prev.filter(n => n !== file.name));
            if (attId) {
              newIds.push(attId);
              uploadedNames.push(String(displayName));
              setLabels(prev => ({
                ...prev,
                [attId]: String(displayName),
              }));
              setLocalFiles(prev => prev.filter(f => f !== file));
            } else {
              showToast('Upload completed but no attachment id was returned', 'error');
            }
          } catch (fileErr) {
            setPendingNames(prev => prev.filter(n => n !== file.name));
            showToast(
              errorMessageFromAxios(fileErr, 'Upload failed'),
              'error',
            );
          }
        }
        if (newIds.length) {
          const existingIds = valueItems.map(item => item.id).filter(Boolean) as string[];
          const mergedIds = [
            ...existingIds.filter(id => !newIds.includes(id)),
            ...newIds,
          ];
          const merged = many ? mergedIds : newIds[newIds.length - 1];
          onChange(merged);
          showToast(
            newIds.length === 1
              ? `Attached ${uploadedNames[0] || 'file'}`
              : `Attached ${newIds.length} files`,
            'success',
          );
        }
      } finally {
        setUploading(false);
      }
    } else {
      setPendingNames([]);
      const nextItems = [...valueItems];
      for (const file of toUpload) {
        nextItems.push({ file, name: file.name });
      }
      emitItems(nextItems);
      if (toUpload.length === 1) {
        showToast(`Attached ${toUpload[0].name}`, 'success');
      } else {
        showToast(`Attached ${toUpload.length} files`, 'success');
      }
    }
  };

  return (
    <div className={`space-y-1.5 ${externalLabel ? '' : 'pl-3'}`}>
      {!externalLabel && (
        <p className="text-[12px] font-medium text-[var(--text-muted)]">
          {field.name} {field.required && <span className="text-red-500">*</span>}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {items.length === 0 && !readonly && (
          <span className="text-xs italic text-[var(--text-subtle)]">No file selected</span>
        )}
        {items.length === 0 && readonly && (
          <span className="text-xs italic text-[var(--text-subtle)]">No file</span>
        )}
        {items.map((item, index) => (
          <span
            key={item.id || `local-${index}-${item.name}`}
            data-testid={`file-chip-${field.key}`}
            className={`inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-[var(--radius-pill)] border px-2.5 py-1 text-xs font-medium text-[var(--text)] ${
              item.failed
                ? 'border-red-500/40 bg-red-500/10'
                : item.pending
                  ? 'border-[var(--panel-border)] bg-[var(--panel-2)]'
                  : 'border-emerald-500/35 bg-emerald-500/10'
            }`}
            title={item.name}
          >
            {!item.pending && !item.failed ? (
              <CheckCircle2
                size={12}
                strokeWidth={LINE_ICON_STROKE}
                className="shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden
              />
            ) : null}
            <Paperclip
              size={11}
              strokeWidth={LINE_ICON_STROKE}
              className="shrink-0 text-[var(--text-muted)]"
            />
            <span className="min-w-0 truncate">{item.name}</span>
            {!readonly && !item.pending && (
              <button
                type="button"
                onClick={() => remove(item)}
                aria-label={`Remove ${item.name}`}
                className="shrink-0 text-[var(--text-muted)] hover:text-[var(--danger-fg)]"
              >
                <X size={10} strokeWidth={LINE_ICON_STROKE} />
              </button>
            )}
            {item.pending ? (
              <span className="text-[10px] text-[var(--text-muted)]">Uploading…</span>
            ) : null}
          </span>
        ))}
        {!readonly && items.filter(i => !i.failed).length < maxCount && (
          <label className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-[var(--radius-pill)] border border-dashed border-[var(--panel-border)] px-2 py-0.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
            <Paperclip size={11} strokeWidth={LINE_ICON_STROKE} />
            {uploading ? 'Uploading…' : items.length ? 'Attach another' : 'Attach file'}
            <input
              type="file"
              multiple={many}
              accept={accept.join(',') || undefined}
              className="hidden"
              disabled={uploading}
              onChange={e => {
                const picked = e.target.files ? Array.from(e.target.files) : [];
                e.target.value = '';
                void handleFiles(picked);
              }}
            />
          </label>
        )}
      </div>
    </div>
  );
}
