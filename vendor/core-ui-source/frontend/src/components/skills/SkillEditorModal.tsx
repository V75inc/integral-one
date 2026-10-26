import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Lock, Plus, SlidersHorizontal, Wrench, X } from 'lucide-react';

import {
  skillsApi,
  type SkillComplianceWarning,
  type SkillDetail,
  type SkillSummary,
  type SkillUpdateBody,
  type ToolCatalogueEntry
} from '../../api/skills';
import { MarkdownContent } from '../ui/MarkdownContent';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Surface, Text, Textarea } from '../../ui';
import { Field } from '../../patterns';
import { SkillRichEditor } from './SkillRichEditor';
import {
  composeSkillDocument,
  parseSkillDocument,
  type SkillDocFields
} from './skillDocument';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';

const POWER_MODE_KEY = 'integral.skills.editor.powerMode';

const WORKSPACE_SKILL_TEMPLATE = `## When to use

Describe the user intents that should route to this skill.

## When NOT to use — delegate

List adjacent skills or base skills for neighboring intents.

## Grounding (read before write)

Which read tools to call before any mutation.

## Procedure

Numbered tool sequence with decision points.

## Staging discipline

How propose/bless and batching work for this workflow.

## Forbidden patterns

Tempting shortcuts to reject.

## Example

One concrete end-to-end walkthrough.
`;

function extractToolRefs(body: string): string[] {
  const found = new Set<string>();
  const tick = /`([a-z][a-z0-9_]*)`/g;
  let m: RegExpExecArray | null;
  while ((m = tick.exec(body)) !== null) {
    if (m[1].startsWith('integral_')) found.add(m[1]);
  }
  return [...found];
}

interface SkillEditorModalProps {
  open: boolean;
  skillId: string | null;
  canManage: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function SkillEditorModal({
  open,
  skillId,
  canManage,
  onClose,
  onSaved
}: SkillEditorModalProps) {
  const confirm = useConfirm();
  const toast = useToast();
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'view' | 'edit'>('view');
  const [hoveredTab, setHoveredTab] = useState<'view' | 'edit' | null>(null);
  const [toolPickerOpen, setToolPickerOpen] = useState(false);
  const [toolPickerQuery, setToolPickerQuery] = useState('');
  const [hoveredPickerTool, setHoveredPickerTool] = useState<string | null>(null);
  const [hoveredRemoveTool, setHoveredRemoveTool] = useState<string | null>(null);
  const [powerMode, setPowerMode] = useState(
    () => localStorage.getItem(POWER_MODE_KEY) === '1',
  );
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const [toolsRequired, setToolsRequired] = useState<string[]>([]);
  // Full SKILL.md (frontmatter + body) — the source of truth while in power mode.
  const [rawDoc, setRawDoc] = useState('');
  const [saving, setSaving] = useState(false);
  const [complianceWarnings, setComplianceWarnings] = useState<SkillComplianceWarning[]>([]);

  const applyDocFields = (f: SkillDocFields) => {
    setName(f.name);
    setDescription(f.description);
    setToolsRequired(f.tools);
    setBody(f.body);
  };

  const readOnly = !canManage || detail?.read_only === true;
  const isCreate = skillId === '__new__';
  const toolQuery = useQuery({
    queryKey: ['skill-tools'],
    queryFn: () => skillsApi.toolCatalogue(),
    enabled: open && canManage && (isCreate || (detail?.id === skillId && tab === 'edit' && !readOnly)),
    staleTime: 60_000,
  });
  const tools = useMemo(() => toolQuery.data?.tools ?? [], [toolQuery.data]);
  useEffect(() => {
    if (toolQuery.isError) toast.showToast('Could not load tools. Reopen the editor to try again.', 'error');
  }, [toolQuery.isError, toast]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setToolPickerOpen(false);
    setToolPickerQuery('');
    (async () => {
      setLoading(true);
      try {
        if (isCreate) {
          setDetail(null);
          setName('');
          setDescription('');
          setBody(WORKSPACE_SKILL_TEMPLATE);
          setToolsRequired([]);
          setComplianceWarnings([]);
          setRawDoc(
            composeSkillDocument({
              name: '',
              description: '',
              tools: [],
              body: WORKSPACE_SKILL_TEMPLATE
            }),
          );
          setTab('edit');
        } else if (skillId) {
          const d = await skillsApi.get(skillId);
          if (cancelled) return;
          setDetail(d);
          setComplianceWarnings(d.warnings ?? []);
          setName(d.name);
          setDescription(d.description);
          const loadedBody =
            (d.domain_body ?? '').trim() ||
            (d.bundle_default_body ?? '').trim() ||
            (d.resolved_body ?? '').trim();
          setBody(loadedBody);
          const loadedTools = [...(d.tools_required || [])];
          setToolsRequired(loadedTools);
          setRawDoc(
            composeSkillDocument({
              name: d.name,
              description: d.description,
              tools: loadedTools,
              body: loadedBody
            }),
          );
          // Default to the rendered View when there's content to read.
          setTab(loadedBody ? 'view' : 'edit');
        }
      } catch {
        toast.showToast('Failed to load skill', 'error');
        onClose();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, skillId, isCreate, onClose, toast]);

  const unknownTools = useMemo(() => {
    if (!toolQuery.data) return [];
    const known = new Set(tools.map(t => t.name));
    return toolsRequired.filter(t => !known.has(t));
  }, [tools, toolsRequired, toolQuery.data]);

  const addTool = (tool: ToolCatalogueEntry) => {
    setToolsRequired(prev => (prev.includes(tool.name) ? prev : [...prev, tool.name]));
  };

  const removeTool = (toolName: string) => {
    setToolsRequired(prev => prev.filter(t => t !== toolName));
  };

  const pickerCandidates = useMemo(() => {
    const q = toolPickerQuery.trim().toLowerCase();
    const selected = new Set(toolsRequired);
    return tools
      .filter(t => !selected.has(t.name))
      .filter(
        t =>
          !q ||
          t.name.toLowerCase().includes(q) ||
          t.friendly_label.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [tools, toolsRequired, toolPickerQuery]);

  const togglePowerMode = () => {
    setPowerMode(prev => {
      const next = !prev;
      localStorage.setItem(POWER_MODE_KEY, next ? '1' : '0');
      if (next) {
        // Entering power mode — compose the full SKILL.md from current fields.
        setRawDoc(composeSkillDocument({ name, description, tools: toolsRequired, body }));
      } else {
        // Leaving power mode — parse frontmatter back into the fields.
        applyDocFields(parseSkillDocument(rawDoc, { name, description, tools: toolsRequired, body }));
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (readOnly) return;
    // In power mode the raw SKILL.md is the source of truth — parse the
    // frontmatter + body back into fields before persisting.
    const eff: SkillDocFields = powerMode
      ? parseSkillDocument(rawDoc, { name, description, tools: toolsRequired, body })
      : { name, description, tools: toolsRequired, body };
    if (powerMode) applyDocFields(eff);
    if (!eff.description.trim()) {
      toast.showToast('Description is required', 'error');
      return;
    }
    setSaving(true);
    try {
      if (isCreate) {
        const key = eff.name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '');
        const created = await skillsApi.create({
          key: key || 'custom_skill',
          name: eff.name,
          description: eff.description,
          body_override: eff.body,
          tools_required: eff.tools
        });
        setComplianceWarnings(created.warnings ?? []);
        toast.showToast('Skill created', 'success');
      } else if (skillId) {
        const patch: SkillUpdateBody = {};
        if (eff.name !== (detail?.name ?? '')) patch.name = eff.name;
        if (eff.description !== (detail?.description ?? '')) patch.description = eff.description;
        const origTools = detail?.tools_required ?? [];
        if (
          eff.tools.length !== origTools.length ||
          eff.tools.some((t, i) => t !== origTools[i])
        ) {
          patch.tools_required = eff.tools;
        }
        // Only persist a body override when the user actually changed the body
        // from what was loaded — a name-only tweak on a pristine bundle skill
        // must not freeze the current default as a permanent override.
        if (eff.body !== (detail?.domain_body ?? '')) {
          patch.body_override = eff.body;
        }
        if (Object.keys(patch).length === 0) {
          onClose();
          return;
        }
        const updated = await skillsApi.update(skillId, patch);
        setComplianceWarnings(updated.warnings ?? []);
        toast.showToast('Skill saved', 'success');
      }
      onSaved();
      onClose();
    } catch {
      toast.showToast('Failed to save skill', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!skillId || isCreate) return;
    const ok = await confirm({
      title: 'Reset to bundle default?',
      message: 'Your workspace customization will be cleared.',
      confirmLabel: 'Reset',
      variant: 'danger'
    });
    if (!ok) return;
    try {
      const d = await skillsApi.reset(skillId);
      setDetail(d);
      setName(d.name);
      setDescription(d.description);
      setBody(d.domain_body ?? d.resolved_body ?? '');
      setToolsRequired([...(d.tools_required || [])]);
      setRawDoc(
        composeSkillDocument({
          name: d.name,
          description: d.description,
          tools: [...(d.tools_required || [])],
          body: d.domain_body ?? d.resolved_body ?? ''
        }),
      );
      toast.showToast('Skill reset', 'success');
      onSaved();
    } catch {
      toast.showToast('Failed to reset skill', 'error');
    }
  };

  const handleDelete = async () => {
    if (!skillId || isCreate || detail?.source !== 'workspace') return;
    const ok = await confirm({
      title: 'Delete workspace skill?',
      message: 'This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger'
    });
    if (!ok) return;
    try {
      await skillsApi.remove(skillId);
      toast.showToast('Skill deleted', 'success');
      onSaved();
      onClose();
    } catch {
      toast.showToast('Failed to delete skill', 'error');
    }
  };

  useEffect(() => {
    const fromBody = extractToolRefs(body);
    setToolsRequired(prev => {
      const merged = new Set([...prev, ...fromBody]);
      return [...merged];
    });
  }, [body]);

  const showDelete = detail?.source === 'workspace' && canManage && !isCreate;
  const showReset = detail?.customized && canManage && !readOnly && !isCreate;
  const hasFooterLeft = showDelete;

  const bodyHasContent = body.trim().length > 0;
  // View (rendered) is default; fall back to Edit when there's nothing to show.
  const effectiveTab: 'view' | 'edit' =
    tab === 'view' && !bodyHasContent ? 'edit' : tab;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isCreate ? 'New workspace skill' : detail?.name || 'Skill'}
      titleIcon={<Wrench size={18} />}
      width="max-w-dialog-wide"
      headerActions={
        !readOnly && effectiveTab === 'edit' ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={togglePowerMode}
            aria-pressed={powerMode}
            title={powerMode ? 'Switch to simple editor' : 'Show raw skill'}
          >
            <SlidersHorizontal size={14} className="mr-1.5" />
            {powerMode ? 'Simple mode' : 'Power mode'}
          </Button>
        ) : null
      }
    >
      {loading ? (
        <Modal.Body>
          <Text as="p" variant="body" tone="muted">
            Loading…
          </Text>
        </Modal.Body>
      ) : (
        <>
          <Modal.Body>
            {detail?.stale_default ? (
              <div className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[var(--warn-fg)]/30 bg-[var(--warn-bg)] px-3 py-2 text-sm text-[var(--warn-fg)]">
                <span>Bundle default updated since your customization.</span>
                {canManage && !readOnly ? (
                  <Button variant="ghost" size="sm" onClick={handleReset}>
                    Reset
                  </Button>
                ) : null}
              </div>
            ) : null}

            {readOnly ? (
              <>
                <Surface tone="panel-2" border="none" radius="pill" className="w-fit">
                  <Text
                    as="span"
                    variant="body-sm"
                    weight="medium"
                    tone="muted"
                    className="flex items-center gap-1.5 px-2.5 py-1"
                  >
                    <Lock size={12} />
                    Read-only
                  </Text>
                </Surface>
                <Field
                  label="When should the agent use this?"
                  hint="Discovery description from standard SKILL.md frontmatter."
                >
                  <Textarea
                    rows={3}
                    readOnly
                    value={description}
                    className="resize-none opacity-90"
                  />
                </Field>
                {toolsRequired.length > 0 ? (
                  <Field label="Tools this skill uses">
                    <div className="flex flex-wrap gap-2">
                      {toolsRequired.map(t => (
                        <span
                          key={t}
                          className="inline-flex rounded-md bg-[var(--badge-muted-bg)] px-2 py-0.5 font-mono text-xs text-[var(--badge-muted-fg)]"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </Field>
                ) : null}
                <Field label="Instructions">
                  <Surface tone="panel-2" border="default" radius="card" className="px-4 py-4">
                    <MarkdownContent>{detail?.resolved_body || body}</MarkdownContent>
                  </Surface>
                </Field>
              </>
            ) : (
              <>
                <div
                  role="tablist"
                  aria-label="Skill view"
                  className="flex gap-1 border-b border-[var(--panel-border)]"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={effectiveTab === 'view'}
                    disabled={!bodyHasContent}
                    onClick={() => setTab('view')}
                    onMouseEnter={() => setHoveredTab('view')}
                    onMouseLeave={() => setHoveredTab(null)}
                    title={!bodyHasContent ? 'Add instructions to preview' : undefined}
                    className={`-mb-px border-b-2 px-3 py-2 transition-colors ${
                      effectiveTab === 'view' ? 'border-[var(--accent)]' : 'border-transparent'
                    } ${!bodyHasContent ? 'cursor-not-allowed opacity-40' : ''}`}
                  >
                    <Text
                      as="span"
                      variant="body-sm"
                      weight={effectiveTab === 'view' ? 'medium' : 'normal'}
                      tone={effectiveTab === 'view' || hoveredTab === 'view' ? 'default' : 'muted'}
                    >
                      View
                    </Text>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={effectiveTab === 'edit'}
                    onClick={() => setTab('edit')}
                    onMouseEnter={() => setHoveredTab('edit')}
                    onMouseLeave={() => setHoveredTab(null)}
                    className={`-mb-px border-b-2 px-3 py-2 transition-colors ${
                      effectiveTab === 'edit' ? 'border-[var(--accent)]' : 'border-transparent'
                    }`}
                  >
                    <Text
                      as="span"
                      variant="body-sm"
                      weight={effectiveTab === 'edit' ? 'medium' : 'normal'}
                      tone={effectiveTab === 'edit' || hoveredTab === 'edit' ? 'default' : 'muted'}
                    >
                      Edit
                    </Text>
                  </button>
                </div>

                {effectiveTab === 'view' ? (
                  <Surface tone="panel-2" border="default" radius="card" className="px-4 py-4">
                    <MarkdownContent>{body}</MarkdownContent>
                  </Surface>
                ) : (
                  <div className="flex flex-col gap-4">
                    {complianceWarnings.length > 0 ? (
                      <Surface
                        tone="panel-2"
                        border="default"
                        radius="card"
                        className="border-amber-500/40 bg-amber-500/5 px-4 py-3"
                      >
                        <Text as="p" variant="body-sm" weight="medium">
                          Compliance suggestions (save still allowed)
                        </Text>
                        <ul className="mt-2 list-disc space-y-1 pl-5">
                          {complianceWarnings.map(w => (
                            <li key={w.code}>
                              <Text as="span" variant="body-sm" tone="muted">
                                {w.message}
                              </Text>
                            </li>
                          ))}
                        </ul>
                      </Surface>
                    ) : null}
                    {!powerMode ? (
                      <>
                        <Field label="Name">
                          <Input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g. Weekly report filing"
                          />
                        </Field>
                        <Field
                          label="When should the agent use this?"
                          hint="A one-line description helps the agent decide when to run this skill."
                        >
                          <Textarea
                            rows={2}
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="e.g. When the user asks to file or archive a report."
                          />
                        </Field>
                      </>
                    ) : null}

                    {!powerMode ? (
                    <Field
                      label="Tools this skill uses"
                      hint="The tools this skill is allowed to call."
                    >
                      <div className="flex flex-col gap-2">
                  {toolsRequired.length === 0 ? (
                    <Text as="p" variant="body-sm" tone="muted">
                      No tools added yet.
                    </Text>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {toolsRequired.map(t => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1 rounded-md bg-[var(--badge-muted-bg)] px-2 py-0.5 font-mono text-xs text-[var(--badge-muted-fg)]"
                        >
                          {t}
                          {!readOnly ? (
                            <button
                              type="button"
                              className="-mr-1 flex h-4 w-4 items-center justify-center rounded-full"
                              style={
                                hoveredRemoveTool === t
                                  ? { backgroundColor: 'var(--panel-border)' }
                                  : undefined
                              }
                              onMouseEnter={() => setHoveredRemoveTool(t)}
                              onMouseLeave={() => setHoveredRemoveTool(null)}
                              onClick={() => removeTool(t)}
                              aria-label={`Remove ${t}`}
                            >
                              <Text as="span" tone="muted" className="flex">
                                <X size={11} />
                              </Text>
                            </button>
                          ) : null}
                        </span>
                      ))}
                    </div>
                  )}

                  {!readOnly ? (
                    !toolPickerOpen ? (
                      <button
                        type="button"
                        onClick={() => setToolPickerOpen(true)}
                        className="inline-flex w-fit items-center gap-1 rounded-md border border-dashed border-[var(--panel-border)] px-2 py-1 hover:border-[var(--accent)]"
                      >
                        <Text as="span" variant="body-sm" tone="muted" className="flex items-center gap-1">
                          <Plus size={12} />
                          Add tool
                        </Text>
                      </button>
                    ) : (
                      <Surface tone="panel-2" border="default" radius="card" padding="sm">
                        <Input
                          size="sm"
                          autoFocus
                          value={toolPickerQuery}
                          onChange={e => setToolPickerQuery(e.target.value)}
                          placeholder="Search tools…"
                          aria-label="Search tools to add"
                        />
                        <ul className="mt-2 max-h-40 overflow-y-auto">
                          {pickerCandidates.length === 0 ? (
                            <Text as="li" variant="body-sm" tone="muted" className="px-2 py-1.5">
                              No matching tools
                            </Text>
                          ) : (
                            pickerCandidates.map(t => (
                              <li key={t.name}>
                                <button
                                  type="button"
                                  className="w-full rounded-md px-2 py-1.5 text-left"
                                  style={
                                    hoveredPickerTool === t.name
                                      ? { backgroundColor: 'var(--panel)' }
                                      : undefined
                                  }
                                  onMouseEnter={() => setHoveredPickerTool(t.name)}
                                  onMouseLeave={() => setHoveredPickerTool(null)}
                                  onClick={() => {
                                    addTool(t);
                                    setToolPickerQuery('');
                                  }}
                                >
                                  <div className="text-sm">{t.friendly_label}</div>
                                  <Text as="div" variant="meta" tone="muted" className="font-mono">
                                    {t.name}
                                  </Text>
                                </button>
                              </li>
                            ))
                          )}
                        </ul>
                        <div className="mt-1 flex justify-end">
                          <Button variant="ghost" size="sm" onClick={() => setToolPickerOpen(false)}>
                            Done
                          </Button>
                        </div>
                      </Surface>
                    )
                  ) : null}

                  {unknownTools.length > 0 ? (
                    <p className="text-xs text-[var(--warn-fg)]">
                      Unknown tools: {unknownTools.join(', ')}
                    </p>
                  ) : null}
                </div>
              </Field>
                    ) : null}

                    <Field
                      label={powerMode ? 'Skill file (SKILL.md)' : 'Instructions'}
                      hint={
                        powerMode
                          ? 'The whole skill file — YAML frontmatter (name, description, allowed-tools) plus the markdown body.'
                          : 'Write the step-by-step procedure the agent should follow. Use the toolbar to format.'
                      }
                    >
                      {powerMode ? (
                        <Textarea
                          className="w-full min-h-[28rem]"
                          monospace
                          rows={26}
                          value={rawDoc}
                          onChange={e => setRawDoc(e.target.value)}
                          aria-label="Skill file"
                        />
                      ) : (
                        <SkillRichEditor
                          value={body}
                          onChange={setBody}
                          aria-label="Skill instructions"
                        />
                      )}
                    </Field>

                    {powerMode && detail ? (
                      <Surface
                        tone="panel-2"
                        border="subtle"
                        radius="card"
                        padding="sm"
                        className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs"
                      >
                        <Text as="span" variant="mono" tone="muted">key</Text>
                        <span className="truncate">{detail.key}</span>
                        <Text as="span" variant="mono" tone="muted">namespaced</Text>
                        <span className="truncate">{detail.namespaced_name}</span>
                        <Text as="span" variant="mono" tone="muted">origin</Text>
                        <span>{detail.origin}</span>
                        <Text as="span" variant="mono" tone="muted">trust</Text>
                        <span>{detail.trust_tier}</span>
                        {detail.app_id ? (
                          <>
                            <Text as="span" variant="mono" tone="muted">app</Text>
                            <span className="truncate">{detail.app_slug || 'App'}</span>
                          </>
                        ) : null}
                      </Surface>
                    ) : null}
                  </div>
                )}
              </>
            )}
          </Modal.Body>

          <Modal.Footer align={hasFooterLeft ? 'between' : 'end'}>
            {showDelete ? (
              <Button variant="danger" onClick={handleDelete}>
                Delete
              </Button>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              {showReset ? (
                <Button variant="secondary" onClick={handleReset}>
                  Reset to default
                </Button>
              ) : null}
              <Button variant="secondary" onClick={onClose}>
                {readOnly ? 'Close' : 'Cancel'}
              </Button>
              {!readOnly ? (
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              ) : null}
            </div>
          </Modal.Footer>
        </>
      )}
    </Modal>
  );
}

export function skillBadges(skill: SkillSummary) {
  const badges: string[] = [];
  if (skill.source === 'core') badges.push('Core');
  if (skill.customized) badges.push('Customized');
  if (skill.stale_default) badges.push('Default updated');
  if (!skill.enabled) badges.push('Disabled');
  if (skill.kind === 'custom') badges.push('Code skill');
  return badges;
}
