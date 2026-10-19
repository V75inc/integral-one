import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import {
  Plus, CheckCircle2,
  HelpCircle, Loader2, MessageSquare, Edit2
} from 'lucide-react';
import {
  publicSharingApi,
  type PublicEntryType,
  type PublicOnboardingPolicy,
  type PublicSharedEntry,
  type PublicTrackPayload,
} from '../api/sharing';
import { authApi } from '../api/auth';
import { useAuthOptional } from '../context/AuthContext';
import type { Entry, EntryTypeNode } from '../types';
import { Button } from '../components/ui/Button';
import { MarkdownContent } from '../components/ui';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../context/ToastContext';
import { ViewRenderer } from '../views';
import { ViewTabs } from '../components/ui';
import { Text, Surface, Input, Textarea, Select } from '../ui';
import { SeamlessField } from '../components/entries/SeamlessField';
import { EntryMetaFields } from '../components/entries/EntryMetaFields';
import { CommentsPanel, COMMENT_FOOTER_CLASS } from '../components/entries/comments/CommentsPanel';
import { CommentComposer } from '../components/entries/comments/CommentComposer';
import { useIsMdUp } from '../hooks/useMediaQuery';
import { LINE_ICON_STROKE } from '../components/ui';
import { canonicalEntryTypeSlug, entrySaveErrorMessage, entryTypeIdentitySlugs, normalizeEntry } from '../api/helpers';
import { humanizeEnumValue } from '../utils/humanizeFieldKey';
import { buildBaseSlotPlaceholder } from '../utils/fieldPlaceholders';
import {
  slug,
  filterEntryTypeSlugsForView,
  resolveCreateDefaultEntryType
} from '../components/entries/entryFormCustomFields';
import { getMissingRequiredFields } from '../utils/entryMetaFields';
import {
  resolveKanbanGroupBy,
  resolveKanbanWriteFieldKey,
  shouldRouteKanbanQuickAddToCompose
} from '../components/views/kanbanColumnUtils';
import type { OperationalModelFieldSpec } from '../types';
import {
  PolicyAcknowledgmentStep,
  firstMissingRequiredPolicy,
} from '../components/intakeForm/PolicyAcknowledgmentStep';
import {
  ContractReviewHost as ContractReviewStep,
  ContractReviewRejectedTerminal,
} from '../host/ContractReviewHost';
import { memberAssignedFormApi } from '../features/memberAssignedForm/memberAssignedFormApi';

function isEmptyFileFieldValue(val: unknown): boolean {
  if (val === undefined || val === null || val === '') return true;
  if (Array.isArray(val)) return val.length === 0;
  return false;
}

type WizardStepField = {
  type?: string;
  spec?: { key?: string };
};

/** Include every wizard field key on save/submit (read-only steps do not fire onChange). */
function customFieldsForWizardSave(
  steps: Array<{ fields?: WizardStepField[] }>,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...values };
  for (const step of steps) {
    for (const fieldItem of step.fields ?? []) {
      if (fieldItem.type === 'custom' && fieldItem.spec?.key) {
        const key = String(fieldItem.spec.key);
        if (key in values) out[key] = values[key];
      }
    }
  }
  return out;
}

export function SharedTrackPage({ memberFormMode = false }: { memberFormMode?: boolean } = {}) {
  const { token = '' } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const queryEntryId = searchParams.get('entry')?.trim() || '';
  const [memberEntryId, setMemberEntryId] = useState('');
  const assignedEntryId = memberFormMode ? (queryEntryId || memberEntryId) : queryEntryId;
  const openingId = searchParams.get('opening')?.trim() || '';
  const toast = useToast();
  const auth = useAuthOptional();
  const navigate = useNavigate();
  const isLoggedIn = Boolean(auth?.user);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PublicTrackPayload | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Entries & Search State
  const [entries, setEntries] = useState<Entry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);

  // Active View State
  const [activeView, setActiveView] = useState<any | null>(null);

  // Form State (Google Form Mode or Create Modal)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedEntryType, setSelectedEntryType] = useState<any>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formCustomFields, setFormCustomFields] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [wizardStepBusy, setWizardStepBusy] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [assignedEntryLocked, setAssignedEntryLocked] = useState(false);
  const [assignedEntryLoading, setAssignedEntryLoading] = useState(false);
  const assignedEntryHydratedRef = useRef(false);

  // Open entry dialog (read-first; edit is a mode of the same surface)
  const [openEntry, setOpenEntry] = useState<Entry | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [commentsPanelOpen, setCommentsPanelOpen] = useState(false);
  const showSideColumn = useIsMdUp();
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editCustomFields, setEditCustomFields] = useState<Record<string, any>>({});

  // Comments State
  const [comments, setComments] = useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  // Relation Choices State
  const [relationChoices, setRelationChoices] = useState<Record<string, any[]>>({});
  const [relationLoading, setRelationLoading] = useState(false);

  // Validation Error State
  const [invalidFieldKey, setInvalidFieldKey] = useState<string | null>(null);

  // Wizard Step State
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [onboardingPolicies, setOnboardingPolicies] = useState<PublicOnboardingPolicy[]>([]);
  const [onboardingPoliciesLoading, setOnboardingPoliciesLoading] = useState(false);
  const [policyStepEnabled, setPolicyStepEnabled] = useState(false);
  const [contractStepEnabled, setContractStepEnabled] = useState(false);
  const [contractRejected, setContractRejected] = useState(false);

  // Dynamic Base Field configs for selected entry type (Creation Form)
  const selectedBaseFields = selectedEntryType?.form_schema?.base_fields || {};
  const selectedTitleBase = selectedBaseFields.title || {};
  const selectedBodyBase = selectedBaseFields.body || {};
  const selectedTitleEnabled = selectedTitleBase.enabled !== false;
  const selectedBodyEnabled = selectedBodyBase.enabled !== false;
  const selectedTitleLabel = String(selectedTitleBase.label || '').trim() || 'Title';
  const selectedBodyLabel = String(selectedBodyBase.label || '').trim() || 'Description';

  const selectedTitlePlaceholder = useMemo(() => buildBaseSlotPlaceholder({
    label: selectedTitleLabel,
    placeholder: String(selectedTitleBase.placeholder || ''),
    canonicalLabel: 'Title',
    slot: 'title'
  }), [selectedTitleLabel, selectedTitleBase.placeholder]);

  const selectedBodyPlaceholder = useMemo(() => buildBaseSlotPlaceholder({
    label: selectedBodyLabel,
    placeholder: String(selectedBodyBase.placeholder || ''),
    canonicalLabel: 'Body',
    slot: 'body'
  }), [selectedBodyLabel, selectedBodyBase.placeholder]);

  // Dynamic Base Field configs for editing entry type (Edit Form)
  const openEntryType = useMemo(() => {
    if (!openEntry || !data?.entry_types) return null;
    const entryTypeSlug = slug(openEntry.type || '');
    return (
      data.entry_types.find((et: any) =>
        entryTypeIdentitySlugs(et).includes(entryTypeSlug)
      ) || null
    );
  }, [openEntry, data?.entry_types]);

  const editBaseFields = openEntryType?.form_schema?.base_fields || {};
  const editTitleBase = editBaseFields.title || {};
  const editBodyBase = editBaseFields.body || {};
  const editTitleEnabled = editTitleBase.enabled !== false;
  const editBodyEnabled = editBodyBase.enabled !== false;
  const editTitleLabel = String(editTitleBase.label || '').trim() || 'Title';
  const editBodyLabel = String(editBodyBase.label || '').trim() || 'Description';

  const editTitlePlaceholder = useMemo(() => buildBaseSlotPlaceholder({
    label: editTitleLabel,
    placeholder: String(editTitleBase.placeholder || ''),
    canonicalLabel: 'Title',
    slot: 'title'
  }), [editTitleLabel, editTitleBase.placeholder]);

  const editBodyPlaceholder = useMemo(() => buildBaseSlotPlaceholder({
    label: editBodyLabel,
    placeholder: String(editBodyBase.placeholder || ''),
    canonicalLabel: 'Body',
    slot: 'body'
  }), [editBodyLabel, editBodyBase.placeholder]);

  // Compute wizard steps: Personal Details → Contract → other groups → policies
  const formSteps = useMemo(() => {
    if (!selectedEntryType) return [];

    const fields = selectedEntryType.form_schema?.fields || [];
    const isWizardCustomField = (f: { key?: string; group?: string }) => {
      const key = String(f.key || '');
      if (['employee', 'status', 'submitted_at', 'policy_acknowledgments'].includes(key)) {
        return false;
      }
      if (key.startsWith('contract_')) return false;
      if (String(f.group || '').trim().toLowerCase() === 'review') return false;
      return true;
    };

    const groupBuckets: Record<string, any[]> = {};
    const groupOrder: string[] = [];
    const pushToGroup = (groupName: string, fieldItem: any) => {
      const normalizedName = groupName.trim() || 'Personal Details';
      if (!groupBuckets[normalizedName]) {
        groupBuckets[normalizedName] = [];
        groupOrder.push(normalizedName);
      }
      groupBuckets[normalizedName].push(fieldItem);
    };

    for (const f of fields) {
      if (!isWizardCustomField(f)) continue;
      const gName = f.group ? String(f.group).trim() : 'Personal Details';
      pushToGroup(gName, { type: 'custom', spec: f });
    }

    const steps: Array<{ id: string; title: string; fields: any[] }> = [];

    const personalFields: any[] = [];
    if (selectedTitleEnabled) {
      personalFields.push({ type: 'base_title' });
    }
    for (const item of groupBuckets['Personal Details'] || []) {
      personalFields.push(item);
    }
    if (personalFields.length) {
      steps.push({
        id: 'personal-details',
        title: 'Personal Details',
        fields: personalFields,
      });
    }

    if (contractStepEnabled) {
      steps.push({
        id: 'contract-review',
        title: 'Employment Contract',
        fields: [{ type: 'contract_review' }],
      });
    }

    for (const gName of groupOrder) {
      if (gName === 'Personal Details') continue;
      const bucket = groupBuckets[gName];
      if (!bucket?.length) continue;
      steps.push({
        id: gName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        title: gName,
        fields: bucket,
      });
    }

    if (selectedBodyEnabled) {
      steps.push({
        id: 'additional-info',
        title: 'Additional Info',
        fields: [{ type: 'base_body' }],
      });
    }

    if (policyStepEnabled) {
      steps.push({
        id: 'company-documents',
        title: 'Company Documents',
        fields: [{ type: 'policy_acknowledgments' }],
      });
    }

    return steps;
  }, [selectedEntryType, selectedTitleEnabled, selectedBodyEnabled, policyStepEnabled, contractStepEnabled]);

  // Validate the inputs in the current wizard step
  const validateCurrentStep = () => {
    const currentStep = formSteps[currentStepIndex];
    if (!currentStep) return true;

    for (const fieldItem of currentStep.fields) {
      if (fieldItem.type === 'base_title' && selectedTitleEnabled && !formTitle.trim()) {
        toast.showToast(`${selectedTitleLabel} is required`, 'error');
        setInvalidFieldKey('title');
        return false;
      }
      if (fieldItem.type === 'policy_acknowledgments') {
        const missing = firstMissingRequiredPolicy(
          onboardingPolicies,
          formCustomFields.policy_acknowledgments,
        );
        if (missing) {
          toast.showToast(
            `Please acknowledge required document: ${missing.title || 'Company document'}`,
            'error',
          );
          setInvalidFieldKey('policy_acknowledgments');
          return false;
        }
        continue;
      }
      if (fieldItem.type === 'contract_review') {
        const cs = String(formCustomFields.contract_status || '').toLowerCase();
        if (cs !== 'accepted') {
          toast.showToast('Please accept and sign the employment contract to continue', 'error');
          return false;
        }
        continue;
      }
      if (fieldItem.type === 'custom' && fieldItem.spec.required) {
        const val = formCustomFields[fieldItem.spec.key];
        const isFile =
          String(fieldItem.spec.type || '') === 'file' ||
          String(fieldItem.spec.type || '') === 'files';
        if (isFile ? isEmptyFileFieldValue(val) : (val === undefined || val === null || (typeof val === 'string' && !val.trim()))) {
          toast.showToast(`${fieldItem.spec.name} is required`, 'error');
          setInvalidFieldKey(fieldItem.spec.key);
          return false;
        }
      }
    }
    return true;
  };

  const handleNextStep = async () => {
    if (wizardStepBusy) return;
    if (!validateCurrentStep()) return;

    setInvalidFieldKey(null);
    setWizardStepBusy(true);
    try {
    if (assignedEntryId && !assignedEntryLocked) {
      try {
        const patchBody = {
          ...(selectedTitleEnabled ? { title: formTitle } : {}),
          ...(selectedBodyEnabled ? { body: formBody } : {}),
          custom_fields: customFieldsForWizardSave(formSteps, formCustomFields),
        };
        if (memberFormMode) {
          await memberAssignedFormApi.updateForm(patchBody, assignedEntryId);
        } else {
          await publicSharingApi.updatePublicEntry(token, assignedEntryId, patchBody);
        }
      } catch (err: unknown) {
        toast.showToast(
          entrySaveErrorMessage(err, 'Could not save your progress. Check your connection and try again.'),
          'error',
        );
        return;
      }
    }
    const nextIndex = Math.min(currentStepIndex + 1, formSteps.length - 1);
    setCurrentStepIndex(nextIndex);
    } finally {
      setWizardStepBusy(false);
    }
  };

  const isContractReviewStep = Boolean(
    formSteps[currentStepIndex]?.fields?.some(
      (f: { type?: string }) => f.type === 'contract_review',
    ),
  );
  const contractAccepted =
    String(formCustomFields.contract_status || '').toLowerCase() === 'accepted';

  const handlePrevStep = () => {
    setInvalidFieldKey(null);
    setCurrentStepIndex(prev => Math.max(prev - 1, 0));
  };

  // Render a progress stepper at the top of paged forms
  const renderWizardProgress = (steps: any[], currentIndex: number) => {
    if (steps.length <= 1) return null;
    return (
      <div className="mb-6 animate-fade-in">
        <div className="flex justify-between items-center uppercase tracking-wider mb-2">
          <Text variant="meta" weight="semibold" tone="muted">Step {currentIndex + 1} of {steps.length}</Text>
          <Text variant="meta" weight="bold" tone="inherit" className="text-[var(--brand-accent-fg)]">{steps[currentIndex].title}</Text>
        </div>
        <div className="h-1.5 w-full bg-[var(--panel-border)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--brand-accent-fg)] transition-all duration-300 ease-out"
            style={{ width: `${((currentIndex + 1) / steps.length) * 100}%` }}
          />
        </div>
        <div className="flex justify-between mt-3 px-1">
          {steps.map((step, idx) => (
            <div key={step.id} className="flex flex-col items-center flex-1 relative">
              <Surface
                tone={idx > currentIndex ? 'panel-2' : 'transparent'}
                border={idx > currentIndex ? 'default' : 'none'}
                radius="none"
                className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold transition-all duration-200 ${
                  idx === currentIndex
                    ? 'bg-[var(--brand-accent-fg)] text-[var(--bg)] ring-4 ring-[var(--brand-accent-fg)]/20'
                    : idx < currentIndex
                    ? 'bg-emerald-500 text-white'
                    : ''
                }`}
              >
                {idx > currentIndex ? (
                  <Text variant="meta" tone="muted" weight="bold" className="text-[8px] leading-none">{idx + 1}</Text>
                ) : (
                  idx < currentIndex ? '✓' : idx + 1
                )}
              </Surface>
              <Text
                variant="meta"
                weight={idx === currentIndex ? 'semibold' : 'medium'}
                tone={idx === currentIndex ? 'default' : 'muted'}
                className="sm:text-xs mt-2 text-center px-1 leading-tight max-w-[64px] sm:max-w-[120px] truncate sm:whitespace-normal sm:break-words"
              >
                {step.title}
              </Text>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Render fields belonging to the current step
  const renderStepFields = (
    step: any,
    values: Record<string, any>,
    onChange: (key: string, val: any) => void,
    variant: 'modal' | 'form'
  ) => {
    if (!step?.fields) return null;
    const readOnlyStep =
      assignedEntryLocked || step.id === 'personal-details';
    const rowsCount = variant === 'form' ? 4 : 3;
    const publicShareCtx =
      assignedEntryId && token
        ? { token, entryId: assignedEntryId }
        : undefined;

    return step.fields.map((fieldItem: any) => {
      if (fieldItem.type === 'contract_review') {
        if (!assignedEntryId) {
          return (
            <Text key="contract-review" variant="body" tone="muted">
              Contract review requires an assigned form link.
            </Text>
          );
        }
        return (
          <ContractReviewStep
            key="contract-review"
            token={token}
            entryId={assignedEntryId}
            memberFormMode={memberFormMode}
            contractStatus={String(values.contract_status || '')}
            onAccepted={() => {
              setFormCustomFields((prev) => ({ ...prev, contract_status: 'accepted' }));
              setCurrentStepIndex((prev) =>
                Math.min(prev + 1, Math.max(formSteps.length - 1, 0)),
              );
              void reloadAssignedEntry();
            }}
            onRejected={() => {
              setContractRejected(true);
              setFormCustomFields((prev) => ({ ...prev, contract_status: 'rejected' }));
            }}
          />
        );
      }

      if (fieldItem.type === 'policy_acknowledgments') {
        return (
          <PolicyAcknowledgmentStep
            key="policy-acknowledgments"
            token={token}
            memberFormMode={memberFormMode}
            policies={onboardingPolicies}
            loading={onboardingPoliciesLoading}
            value={values.policy_acknowledgments}
            onChange={(next) => {
              onChange('policy_acknowledgments', next);
              if (assignedEntryId && !assignedEntryLocked) {
                const patch = { custom_fields: { policy_acknowledgments: next } };
                void (memberFormMode
                  ? memberAssignedFormApi.updateForm(patch, assignedEntryId)
                  : publicSharingApi.updatePublicEntry(token, assignedEntryId, patch)
                ).catch(() => {
                  /* non-blocking incremental save */
                });
              }
            }}
          />
        );
      }

      if (fieldItem.type === 'base_title') {
        if (readOnlyStep) {
          return (
            <div key="base-title" className="space-y-1.5">
              <Text as="label" variant="label" tone="muted" weight="semibold" className="block">
                {selectedTitleLabel}
              </Text>
              <Text variant="body">{formTitle || '—'}</Text>
            </div>
          );
        }
        return (
          <div key="base-title" className="space-y-1.5">
            <Text as="label" variant="label" tone="muted" weight="semibold" className="block">
              {selectedTitleLabel} <span className="text-red-500">*</span>
            </Text>
            <Input
              type="text"
              required
              placeholder={selectedTitlePlaceholder}
              value={formTitle}
              onChange={e => {
                setFormTitle(e.target.value);
                if (invalidFieldKey === 'title') setInvalidFieldKey(null);
              }}
              invalid={invalidFieldKey === 'title'}
              size={variant === 'form' ? 'md' : 'sm'}
            />
          </div>
        );
      }

      if (fieldItem.type === 'base_body') {
        return (
          <div key="base-body" className="space-y-1.5">
            <Text as="label" variant="label" tone="muted" weight="semibold" className="block">
              {selectedBodyLabel}
            </Text>
            <Textarea
              rows={rowsCount}
              placeholder={selectedBodyPlaceholder}
              value={formBody}
              onChange={e => {
                setFormBody(e.target.value);
                if (invalidFieldKey === 'body') setInvalidFieldKey(null);
              }}
              invalid={invalidFieldKey === 'body'}
              size={variant === 'form' ? 'md' : 'sm'}
            />
          </div>
        );
      }

      const f = readOnlyStep ? { ...fieldItem.spec, readonly: true } : fieldItem.spec;
      const isInvalid = invalidFieldKey === f.key;
      const isFile = String(f.type || '') === 'file' || String(f.type || '') === 'files';
      return (
        <div key={f.key} className="space-y-1">
          <div className={isInvalid ? "rounded-[var(--radius-input)] border border-red-500/80 p-0.5" : ""}>
            <SeamlessField
              field={f}
              value={values[f.key]}
              onChange={val => {
                if (readOnlyStep && !isFile) return;
                onChange(f.key, val);
                if (isInvalid) setInvalidFieldKey(null);
                if (isFile && assignedEntryId && val != null && val !== '' && !assignedEntryLocked) {
                  const isLocalFile =
                    val instanceof File
                    || (Array.isArray(val) && val.some(v => v instanceof File));
                  if (isLocalFile) return;
                  const patch = { custom_fields: { [f.key]: val } };
                  void (memberFormMode
                    ? memberAssignedFormApi.updateForm(patch, assignedEntryId)
                    : publicSharingApi.updatePublicEntry(token, assignedEntryId, patch)
                  ).catch(() => {
                    /* non-blocking incremental save */
                  });
                }
              }}
              relationChoices={relationChoices[f.key]}
              relationLoading={relationLoading}
              entryId={assignedEntryId || undefined}
              publicShare={isFile && !memberFormMode ? publicShareCtx : undefined}
              memberFormUpload={isFile && memberFormMode}
            />
          </div>
        </div>
      );
    });
  };

  // Load Track Details
  const loadTrack = useCallback(async () => {
    try {
      setLoading(true);
      if (memberFormMode) {
        const res = await memberAssignedFormApi.load(queryEntryId || undefined);
        setMemberEntryId(String(res.entry?.id || ''));
        if (res.entry_types?.length) {
          const sortedTypes = [...res.entry_types].sort((a, b) => {
            const aName = (a.name || '').toLowerCase();
            const bName = (b.name || '').toLowerCase();
            if (aName === 'post') return 1;
            if (bName === 'post') return -1;
            return 0;
          });
          res.entry_types = sortedTypes;
        }
        setData(res);
        if (res.entry) {
          const entry = res.entry;
          setMemberEntryId(String(entry.id || ''));
          const status = String(entry.custom_fields?.status || 'draft').toLowerCase();
          setAssignedEntryLocked(status === 'approved' || Boolean(res.locked));
          setFormTitle(entry.title || '');
          setFormBody(entry.body || '');
          setFormCustomFields({ ...(entry.custom_fields || {}) });
          setCurrentStepIndex(0);
          const et = (res.entry_types ?? []).find(t => t.id === entry.type_id);
          if (et) setSelectedEntryType(et);
        }
        const extensions = res.public_share_extensions || {};
        const entryCf = res.entry?.custom_fields || {};
        const hasContractTemplate = Boolean(
          String(entryCf.contract_template || entryCf.contract_template_id || '').trim(),
        );
        const hasContractReviewExt = Boolean(
          String(extensions.contract_review_document_type || '').trim(),
        );
        setContractStepEnabled(hasContractReviewExt || hasContractTemplate);
        const hasPolicyCatalog = Boolean(String(extensions.policy_catalog_track_type_key || '').trim());
        if (hasPolicyCatalog) {
          setPolicyStepEnabled(true);
          setOnboardingPoliciesLoading(true);
          try {
            const policyRes = await memberAssignedFormApi.listPolicyDocuments();
            setOnboardingPolicies(policyRes.policies || []);
          } catch {
            setOnboardingPolicies([]);
            setPolicyStepEnabled(false);
          } finally {
            setOnboardingPoliciesLoading(false);
          }
        }
        return;
      }
      const res = await publicSharingApi.getPublicTrack(token);

      // Move "post" or "Post" to the end of the entry types list so it's not the default
      if (res.entry_types && res.entry_types.length > 0) {
        const sortedTypes = [...res.entry_types].sort((a, b) => {
          const aName = (a.name || '').toLowerCase();
          const bName = (b.name || '').toLowerCase();
          if (aName === 'post') return 1;
          if (bName === 'post') return -1;
          return 0;
        });
        res.entry_types = sortedTypes;
        setSelectedEntryType(sortedTypes[0]);
      }

      setData(res);
      if (res.views && res.views.length > 0) {
        const defView = res.views.find((v: any) => v.is_default) || res.views[0];
        setActiveView(defView);
      }

      const extensions = res.public_share_extensions || {};
      const hasContractReview = Boolean(
        String(extensions.contract_review_document_type || '').trim(),
      );
      setContractStepEnabled(hasContractReview);

      const hasPolicyCatalog = Boolean(
        String(extensions.policy_catalog_track_type_key || '').trim(),
      );
      if (hasPolicyCatalog && (res.public_permissions?.update_entries || res.public_permissions?.read_entries)) {
        setPolicyStepEnabled(true);
        setOnboardingPoliciesLoading(true);
        try {
          const policyRes = await publicSharingApi.listOnboardingPolicies(token);
          setOnboardingPolicies(policyRes.policies || []);
          // Keep the step even when empty so the wizard flow is stable; empty
          // catalog skips required-ack validation.
          setPolicyStepEnabled(true);
        } catch {
          setOnboardingPolicies([]);
          setPolicyStepEnabled(false);
        } finally {
          setOnboardingPoliciesLoading(false);
        }
      } else {
        setPolicyStepEnabled(false);
        setOnboardingPolicies([]);
      }
    } catch (err: unknown) {
      setNotFound(true);
      if (memberFormMode) {
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response?.data
            ?.message ||
          (err as { message?: string })?.message ||
          '';
        if (msg.trim()) {
          toast.showToast(msg.trim(), 'error');
        }
      }
    } finally {
      setLoading(false);
    }
  }, [token, memberFormMode, queryEntryId, toast]);

  const applyAssignedEntryToForm = useCallback(
    (
      entry: PublicSharedEntry,
      entryTypes: PublicEntryType[],
      options?: { resetStep?: boolean; mergeLocal?: boolean },
    ) => {
      const status = String(entry.custom_fields?.status || 'draft').toLowerCase();
      const contractStatus = String(entry.custom_fields?.contract_status || '').toLowerCase();
      if (contractStatus === 'rejected') {
        setContractRejected(true);
      } else {
        setContractRejected(false);
      }
      if (status === 'approved') {
        setAssignedEntryLocked(true);
        return;
      }
      setAssignedEntryLocked(false);
      const entryTypeSlug = String(entry.type || '').toLowerCase();
      const et = entryTypes.find(
        t =>
          t.id === entry.type_id ||
          entryTypeIdentitySlugs(t).includes(slug(entryTypeSlug)),
      );
      if (et) setSelectedEntryType(et);
      setFormTitle(entry.title || '');
      setFormBody(entry.body || '');
      if (options?.mergeLocal) {
        setFormCustomFields(prev => ({
          ...(entry.custom_fields || {}),
          ...prev,
        }));
      } else {
        setFormCustomFields({ ...(entry.custom_fields || {}) });
      }
      if (options?.resetStep !== false) {
        setCurrentStepIndex(0);
      }
    },
    [],
  );

  const reloadAssignedEntry = useCallback(async () => {
    if (!assignedEntryId) return;
    if (!memberFormMode && !data?.public_permissions?.update_entries) return;
    setAssignedEntryLoading(true);
    try {
      if (memberFormMode) {
        const res = await memberAssignedFormApi.load(assignedEntryId);
        applyAssignedEntryToForm(res.entry, data?.entry_types ?? [], {
          resetStep: false,
          mergeLocal: true,
        });
        if (res.locked) setAssignedEntryLocked(true);
      } else {
        const res = await publicSharingApi.getPublicTrackEntry(token, assignedEntryId);
        applyAssignedEntryToForm(res.entry, data?.entry_types ?? [], {
          resetStep: false,
          mergeLocal: true,
        });
      }
    } catch {
      toast.showToast('Could not load your assigned form', 'error');
    } finally {
      setAssignedEntryLoading(false);
    }
  }, [assignedEntryId, applyAssignedEntryToForm, data, token, toast, memberFormMode]);

  useEffect(() => {
    loadTrack();
  }, [loadTrack]);

  useEffect(() => {
    if (memberFormMode) return;
    if (!assignedEntryId || !data?.public_permissions?.update_entries) return;
    let active = true;
    setAssignedEntryLoading(true);
    publicSharingApi
      .getPublicTrackEntry(token, assignedEntryId)
      .then(res => {
        if (!active) return;
        applyAssignedEntryToForm(res.entry, data.entry_types ?? []);
        setSubmittedSuccess(false);
        if (!assignedEntryHydratedRef.current && res.entry.custom_fields) {
          assignedEntryHydratedRef.current = true;
          void publicSharingApi
            .updatePublicEntry(token, assignedEntryId, {
              title: res.entry.title || undefined,
              custom_fields: res.entry.custom_fields as Record<string, unknown>,
            })
            .catch(() => {
              /* best-effort — keeps HR-filled personal details on the entry */
            });
        }
      })
      .catch(() => {
        if (active) toast.showToast('Could not load your assigned form', 'error');
      })
      .finally(() => {
        if (active) setAssignedEntryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [assignedEntryId, applyAssignedEntryToForm, data, token, toast, memberFormMode]);

  // Load Entries (if allowed)
  const loadEntries = useCallback(async () => {
    if (!data?.public_permissions?.read_entries) return;
    try {
      setEntriesLoading(true);
      const res = await publicSharingApi.getPublicTrackEntries(token);
      const normalized = (res.entries || []).map((e: any) => normalizeEntry(e));
      setEntries(normalized);
    } catch {
      toast.showToast('Failed to load entries', 'error');
    } finally {
      setEntriesLoading(false);
    }
  }, [token, data, toast]);

  useEffect(() => {
    if (data?.public_permissions?.read_entries) {
      loadEntries();
    }
  }, [data, loadEntries]);

  // Load Comments
  const loadComments = useCallback(async (entryId: string) => {
    if (!data?.public_permissions?.read_comments) return;
    try {
      setCommentsLoading(true);
      const res = await publicSharingApi.getPublicComments(token, entryId);
      setComments(res.comments || []);
    } catch {
      toast.showToast('Failed to load comments', 'error');
    } finally {
      setCommentsLoading(false);
    }
  }, [token, data, toast]);

  useEffect(() => {
    if (openEntry && data?.public_permissions?.read_comments) {
      loadComments(openEntry.id);
    }
  }, [openEntry, loadComments, data?.public_permissions?.read_comments]);

  const seedOpenEntryForm = useCallback((entry: Entry) => {
    setEditTitle(entry.title || '');
    setEditBody(entry.body || '');
    setEditCustomFields(entry.custom_fields || {});
    setInvalidFieldKey(null);
  }, []);

  const openEntryDialog = useCallback(
    (entry: Entry, opts?: { edit?: boolean; focusComments?: boolean }) => {
      setOpenEntry(entry);
      setEditMode(Boolean(opts?.edit));
      seedOpenEntryForm(entry);
      setCommentsPanelOpen(Boolean(opts?.focusComments));
    },
    [seedOpenEntryForm],
  );

  const closeOpenEntry = useCallback(() => {
    setOpenEntry(null);
    setEditMode(false);
    setCommentsPanelOpen(false);
    setComments([]);
    setNewCommentText('');
  }, []);

  // Relation Choices Fetch — one call per (entry_type, relation field) via the
  // token-scoped relation-options endpoint. Candidate resolution (same-track
  // vs. cross-track sibling tracks under the shared track's App) happens
  // server-side per the field's target_entry_types/target_track_types/
  // allow_cross_track config; the public entries list alone can't cover a
  // relation that targets a DIFFERENT track (e.g. Performance -> Content
  // Pipeline), which is what caused "Content Piece has no available options".
  useEffect(() => {
    if (memberFormMode) return;
    if (!data?.entry_types) return;
    const relationFieldRefs: Array<{ entryTypeId: string; field: any }> = [];
    for (const et of data.entry_types) {
      const fields = et.form_schema?.fields || [];
      for (const f of fields) {
        if (f.type === 'relation') relationFieldRefs.push({ entryTypeId: et.id, field: f });
      }
    }
    if (relationFieldRefs.length === 0) return;

    let active = true;
    setRelationLoading(true);
    Promise.all(
      relationFieldRefs.map(({ entryTypeId, field }) =>
        publicSharingApi
          .getPublicTrackRelationOptions(token, entryTypeId, field.key)
          .then(res => ({ key: field.key, targets: res.targets || [] }))
          // Must mirror the success shape, including optional track_title —
          // otherwise the two branches form a union without that property and
          // reading it below fails.
          .catch(() => ({
            key: field.key,
            targets: [] as Array<{
              id: string;
              title: string;
              track_title?: string;
            }>
          }))
      )
    )
      .then(results => {
        if (!active) return;
        const newChoices: Record<string, any[]> = {};
        for (const { key, targets } of results) {
          newChoices[key] = targets.map(t => ({
            value: t.id,
            label: t.track_title ? `${t.title || 'Untitled record'} (${t.track_title})` : (t.title || 'Untitled record')
          }));
        }
        setRelationChoices(newChoices);
      })
      .finally(() => {
        if (active) setRelationLoading(false);
      });
    return () => {
      active = false;
    };
  }, [data, token, memberFormMode]);

  const trackEntryTypeFields = useMemo(() => {
    const seen = new Map<string, any>();
    const list = data?.entry_types || [];
    for (const et of list) {
      const fields = et.form_schema?.fields || [];
      for (const f of fields) {
        const key = typeof f.key === 'string' ? f.key : '';
        if (key && !seen.has(key)) seen.set(key, f);
      }
    }
    return Array.from(seen.values());
  }, [data]);

  // Filter entry types based on active view
  const filteredEntryTypes = useMemo(() => {
    if (!data?.entry_types) return [];
    if (!activeView) return data.entry_types;
    const allowedSlugs = filterEntryTypeSlugsForView(data.entry_types as any, activeView.entry_type_keys);
    return data.entry_types.filter((et: any) =>
      entryTypeIdentitySlugs(et).some((s: string) => allowedSlugs.includes(s))
    );
  }, [data?.entry_types, activeView]);

  // Update selected entry type when active view changes
  useEffect(() => {
    if (memberFormMode) return;
    if (!data?.entry_types || !filteredEntryTypes.length) return;

    // Find the default entry type based on the view
    const defaultType = resolveCreateDefaultEntryType(
      filteredEntryTypes.map((et: any) => canonicalEntryTypeSlug(et)),
      activeView?.entry_type_keys,
      activeView?.default_entry_type_key,
      data.track?.content_profile_defaults?.default_entry_type
    );

    // Find the entry type object for the default slug
    const selected = filteredEntryTypes.find((et: any) =>
      canonicalEntryTypeSlug(et) === defaultType
    ) || filteredEntryTypes[0];

    setSelectedEntryType(selected);
  }, [data, filteredEntryTypes, activeView, memberFormMode]);

  // De-dupe saved views by (type + entry_type_keys) so the tab strip
  // never shows two literally-identical tabs, just like TrackDetailPage
  const dedupedTabViews = useMemo(() => {
    if (!data?.views) return [];
    const savedViews = data.views.filter(v => !v.hidden);
    const byKey = new Map<string, any>();
    for (const v of savedViews) {
      const keys = Array.isArray(v.entry_type_keys)
        ? [...v.entry_type_keys].map(s => String(s).toLowerCase().trim()).sort()
        : [];
      const dedupeKey = `${v.type}::${keys.join(',')}`;
      const existing = byKey.get(dedupeKey);
      if (!existing) {
        byKey.set(dedupeKey, v);
      } else if (v.is_default && !existing.is_default) {
        byKey.set(dedupeKey, v);
      } else if (
        v.is_default === existing.is_default &&
        v.name &&
        !existing.name
      ) {
        byKey.set(dedupeKey, v);
      }
    }
    return Array.from(byKey.values());
  }, [data]);

  const viewTabOptions = useMemo(() => {
    return dedupedTabViews.map(v => ({
      value: v.id,
      label: v.name || v.type || v.view_type
    }));
  }, [dedupedTabViews]);

  // Keep activeView in sync with deduped views
  useEffect(() => {
    if (!dedupedTabViews.length) return;
    if (!activeView || !dedupedTabViews.some(v => v.id === activeView.id)) {
      const defView = dedupedTabViews.find(v => v.is_default) || dedupedTabViews[0];
      setActiveView(defView);
    }
  }, [dedupedTabViews, activeView]);

  const submitButtonLabel = useMemo(() => {
    if (!data) return 'Submit Response';
    const slug =
      activeView?.default_entry_type_key ||
      activeView?.entry_type_keys?.[0] ||
      data.track.content_profile_defaults?.default_entry_type ||
      data.entry_types?.[0]?.name ||
      'entry';
    const label = humanizeEnumValue(slug);
    return label ? `New ${label}` : 'New entry';
  }, [data, activeView]);

  // Handle Submit Form
  const handleSubmitEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntryType) return;

    // Validate the current step first
    if (!validateCurrentStep()) return;

    // Validate all wizard steps to ensure no required fields are missing
    for (let stepIdx = 0; stepIdx < formSteps.length; stepIdx++) {
      const step = formSteps[stepIdx];
      for (const fieldItem of step.fields) {
        if (fieldItem.type === 'base_title' && selectedTitleEnabled && !formTitle.trim()) {
          toast.showToast(`${selectedTitleLabel} is required`, 'error');
          setInvalidFieldKey('title');
          setCurrentStepIndex(stepIdx);
          return;
        }
        if (fieldItem.type === 'policy_acknowledgments') {
          const missing = firstMissingRequiredPolicy(
            onboardingPolicies,
            formCustomFields.policy_acknowledgments,
          );
          if (missing) {
            toast.showToast(
              `Please acknowledge required document: ${missing.title || 'Company document'}`,
              'error',
            );
            setInvalidFieldKey('policy_acknowledgments');
            setCurrentStepIndex(stepIdx);
            return;
          }
          continue;
        }
        if (fieldItem.type === 'contract_review') {
          const cs = String(formCustomFields.contract_status || '').toLowerCase();
          if (cs !== 'accepted') {
            toast.showToast('Please accept and sign the employment contract', 'error');
            setCurrentStepIndex(stepIdx);
            return;
          }
          continue;
        }
        if (fieldItem.type === 'custom' && fieldItem.spec.required) {
          const val = formCustomFields[fieldItem.spec.key];
          const isFile =
            String(fieldItem.spec.type || '') === 'file' ||
            String(fieldItem.spec.type || '') === 'files';
          if (
            isFile
              ? isEmptyFileFieldValue(val)
              : val === undefined ||
                val === null ||
                (typeof val === 'string' && !val.trim())
          ) {
            toast.showToast(`${fieldItem.spec.name} is required`, 'error');
            setInvalidFieldKey(fieldItem.spec.key);
            setCurrentStepIndex(stepIdx);
            return;
          }
        }
      }
    }

    setSubmitting(true);
    setInvalidFieldKey(null);
    try {
      if (assignedEntryId) {
        const submitBody = {
          title: selectedTitleEnabled ? formTitle : 'Untitled',
          body: selectedBodyEnabled ? formBody : '',
          custom_fields: {
            ...customFieldsForWizardSave(formSteps, formCustomFields),
            status: 'submitted',
          },
        };
        const res = memberFormMode
          ? await memberAssignedFormApi.updateForm(submitBody, assignedEntryId)
          : await publicSharingApi.updatePublicEntry(token, assignedEntryId, submitBody);
        const saved =
          (res as { entry?: PublicSharedEntry }).entry ??
          (res as PublicSharedEntry);
        applyAssignedEntryToForm(saved, data?.entry_types ?? []);
      } else {
        await publicSharingApi.createPublicEntry(token, {
          title: selectedTitleEnabled ? formTitle : 'Untitled',
          type_id: selectedEntryType.id,
          body: selectedBodyEnabled ? formBody : '',
          custom_fields: formCustomFields,
        });
        setFormTitle('');
        setFormBody('');
        setFormCustomFields({});
        setCurrentStepIndex(0);
      }
      setSubmittedSuccess(true);
      toast.showToast(
        assignedEntryId ? 'Form saved' : 'Response submitted successfully',
        'success',
      );
      if (
        auth?.user?.pending_assigned_form?.url?.trim() ||
        auth?.user?.pending_onboarding_form?.url?.trim()
      ) {
        try {
          await authApi.completeAssignedForm();
          await auth.refreshUser();
        } catch {
          /* non-fatal — form was still submitted */
        }
      }
      setShowCreateModal(false);
      loadEntries();
    } catch (err: unknown) {
      const msg = entrySaveErrorMessage(err, 'Failed to submit entry');
      toast.showToast(msg, 'error');
      const match = /(?:Field|Relation field) '([^']+)'/i.exec(msg);
      if (match) {
        // Find which step the invalid field belongs to and switch to it
        setInvalidFieldKey(match[1]);
        for (let stepIdx = 0; stepIdx < formSteps.length; stepIdx++) {
          const hasField = formSteps[stepIdx].fields.some(
            (fi: any) => fi.type === 'custom' && fi.spec.key === match[1]
          );
          if (hasField) {
            setCurrentStepIndex(stepIdx);
            break;
          }
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Edit Entry
  const handleUpdateEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openEntry) return;
    if (editTitleEnabled && !editTitle.trim()) {
      toast.showToast(`${editTitleLabel} is required`, 'error');
      return;
    }

    setSubmitting(true);
    setInvalidFieldKey(null);
    try {
      await publicSharingApi.updatePublicEntry(token, openEntry.id, {
        title: editTitleEnabled ? editTitle : openEntry.title,
        body: editBodyEnabled ? editBody : openEntry.body,
        custom_fields: editCustomFields
      });
      toast.showToast('Entry updated successfully', 'success');
      setEditMode(false);
      closeOpenEntry();
      loadEntries();
    } catch (err: unknown) {
      const msg = entrySaveErrorMessage(err, 'Failed to update entry');
      toast.showToast(msg, 'error');
      const match = /(?:Field|Relation field) '([^']+)'/i.exec(msg);
      if (match) {
        setInvalidFieldKey(match[1]);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Submit Comment
  const handleSubmitComment = async () => {
    if (!openEntry || !newCommentText.trim()) return;

    setPostingComment(true);
    try {
      await publicSharingApi.createPublicComment(token, openEntry.id, newCommentText);
      setNewCommentText('');
      loadComments(openEntry.id);
      toast.showToast('Comment posted', 'success');
    } catch (err: any) {
      toast.showToast(err.message || 'Failed to post comment', 'error');
    } finally {
      setPostingComment(false);
    }
  };

  // Render dynamic form inputs based on EntryType schema using SeamlessField
  const renderFormFields = (
    entryType: any,
    values: Record<string, any>,
    onChange: (key: string, val: any) => void
  ) => {
    if (!entryType?.form_schema?.fields) return null;
    return entryType.form_schema.fields.map((f: any) => {
      const isInvalid = invalidFieldKey === f.key;
      return (
        <div key={f.key} className="space-y-1">
          <div className={isInvalid ? "rounded-[var(--radius-input)] border border-red-500/80 p-0.5" : ""}>
            <SeamlessField
              field={f}
              value={values[f.key]}
              onChange={val => {
                onChange(f.key, val);
                if (isInvalid) setInvalidFieldKey(null);
              }}
              relationChoices={relationChoices[f.key]}
              relationLoading={relationLoading}
            />
          </div>
        </div>
      );
    });
  };

  if (openingId && !assignedEntryId && !memberFormMode) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg)] p-6 text-center">
        <Surface tone="panel" radius="card" elevation="pop" className="max-w-md w-full p-8">
          <HelpCircle size={48} className="mx-auto" style={{ color: 'var(--text-muted)' }} />
          <Text variant="heading-lg" weight="bold" as="h1" className="block mt-4">
            Application unavailable
          </Text>
          <Text variant="body" tone="muted" as="p" className="block mt-2 leading-relaxed">
            Public job applications are not configured on this server build.
          </Text>
        </Surface>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg)] gap-3">
        <Loader2 className="animate-spin text-[var(--brand-accent-fg)]" size={24} />
        <Text variant="body" tone="muted">Loading public track…</Text>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg)] p-6 text-center">
        <Surface tone="panel" radius="card" elevation="pop" className="max-w-md w-full p-8">
          <HelpCircle size={48} className="mx-auto animate-bounce" style={{ color: 'var(--text-muted)' }} />
          <Text variant="heading-lg" weight="bold" as="h1" className="block mt-4">Not Available</Text>
          <Text variant="body" tone="muted" as="p" className="block mt-2 leading-relaxed">
            {memberFormMode
              ? 'We could not find a form linked to your account. Contact your workspace administrator if you believe this is an error.'
              : 'This public link is invalid, has expired, or has been revoked by the owner.'}
          </Text>
        </Surface>
      </div>
    );
  }

  const perms = data.public_permissions;
  const track = data.track;
  if (!track) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg)] p-6 text-center">
        <Surface tone="panel" radius="card" elevation="pop" className="max-w-md w-full p-8">
          <HelpCircle size={48} className="mx-auto" style={{ color: 'var(--text-muted)' }} />
          <Text variant="heading-lg" weight="bold" as="h1" className="block mt-4">Not Available</Text>
          <Text variant="body" tone="muted" as="p" className="block mt-2 leading-relaxed">
            Form track metadata is missing. Contact your workspace administrator if this persists.
          </Text>
        </Surface>
      </div>
    );
  }
  const isAssignedFormMode =
    memberFormMode || (Boolean(assignedEntryId) && Boolean(perms.update_entries));
  const isGoogleFormMode =
    memberFormMode ||
    isAssignedFormMode ||
    (!perms.read_entries && perms.create_entries);

  if (assignedEntryLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg)] p-6">
        <Text as="span" variant="body" tone="muted"><Loader2 className="animate-spin" size={32} /></Text>
        <Text variant="body" tone="muted" className="mt-3">Loading your form…</Text>
      </div>
    );
  }

  // GOOGLE FORM LAYOUT MODE
  if (isGoogleFormMode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[var(--bg)] via-[var(--bg)] to-[var(--panel-3)]/10 py-12 px-4 flex flex-col justify-center items-center">
        <Surface tone="panel" radius="card" elevation="pop" className="max-w-xl w-full overflow-hidden relative">

          {/* Subtle Accent Glow */}
          <div
            className="h-1.5 w-full"
            style={{ backgroundColor: track.accent_color || 'var(--brand-accent-fg)' }}
          />

          <div className="p-6 sm:p-8 space-y-6">

            {/* Header info */}
            <div className="space-y-2 border-b border-[var(--panel-border)] pb-5">
              <div className="flex items-center gap-3">
                <Text variant="heading-lg" weight="bold" as="h1">{track.title}</Text>
              </div>
              {track.purpose && (
                <Text variant="subtitle" tone="muted" as="p" className="block">
                  {track.purpose}
                </Text>
              )}
            </div>

            {contractRejected ? (
              <ContractReviewRejectedTerminal />
            ) : assignedEntryLocked ? (
              <div className="text-center py-8 space-y-4 animate-fade-in">
                <CheckCircle2 size={56} className="mx-auto text-emerald-500" />
                <div>
                  <Text variant="heading-md" weight="semibold" as="h2">Submission approved</Text>
                  <Text variant="body-sm" tone="muted" as="p" className="block mt-1">
                    Your workspace has approved this form. Contact an administrator if you need to change anything.
                  </Text>
                </div>
                <Button
                  variant="primary"
                  onClick={() => navigate(isLoggedIn ? '/' : '/login')}
                  className="mt-2"
                >
                  {isLoggedIn ? 'Go home' : 'Go to login'}
                </Button>
              </div>
            ) : submittedSuccess ? (
              <div className="text-center py-8 space-y-4 animate-fade-in">
                <CheckCircle2 size={56} className="mx-auto text-emerald-500 animate-pulse" />
                <div>
                  <Text variant="heading-md" weight="semibold" as="h2">Response Recorded</Text>
                  <Text variant="body-sm" tone="muted" as="p" className="block mt-1">
                    {assignedEntryId
                      ? 'Thank you! Your form has been submitted.'
                      : 'Thank you! Your response has been submitted successfully to the track.'}
                  </Text>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 justify-center mt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSubmittedSuccess(false);
                      if (assignedEntryId) {
                        void reloadAssignedEntry();
                      }
                    }}
                  >
                    {assignedEntryId ? 'Edit response' : 'Submit another response'}
                  </Button>
                  {assignedEntryId ? (
                    <Button
                      variant="primary"
                      onClick={() => navigate(isLoggedIn ? '/' : '/login')}
                    >
                      {isLoggedIn ? 'Go home' : 'Go to login'}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmitEntry} className="space-y-5">
                {/* Entry Type selector if multiple types exist */}
                {filteredEntryTypes.length > 1 && (
                  <div className="space-y-1.5">
                    <Text as="label" variant="label" tone="muted" weight="semibold" className="block">
                      Response Type
                    </Text>
                    <Select
                      value={selectedEntryType?.id || ''}
                      onChange={e => {
                        const et = filteredEntryTypes.find(t => t.id === e.target.value);
                        if (et) {
                          setSelectedEntryType(et);
                          setFormCustomFields({});
                          setCurrentStepIndex(0);
                        }
                      }}
                    >
                      {filteredEntryTypes.map(et => (
                        <option key={et.id} value={et.id}>
                          {et.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}

                {/* Progress Indicators if wizard has multiple steps */}
                {renderWizardProgress(formSteps, currentStepIndex)}

                {/* Render fields for the current active step */}
                <div className="space-y-4">
                  {formSteps[currentStepIndex]?.id === 'personal-details' ? (
                    <Text variant="body-sm" tone="muted" className="block">
                      Personal details are filled in from HR records. You cannot edit them here; they
                      are saved and submitted with the rest of your form.
                    </Text>
                  ) : null}
                  {formSteps[currentStepIndex] && renderStepFields(
                    formSteps[currentStepIndex],
                    formCustomFields,
                    (k, v) => {
                      setFormCustomFields(prev => ({ ...prev, [k]: v }));
                    },
                    'form'
                  )}
                </div>

                <div className="pt-4 border-t border-[var(--panel-border)] flex justify-between items-center">
                  <div>
                    {formSteps.length > 1 && currentStepIndex > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handlePrevStep}
                      >
                        Back
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {formSteps.length > 1 && currentStepIndex < formSteps.length - 1 ? (
                      <Button
                        key="wizard-next-btn"
                        type="button"
                        variant="primary"
                        disabled={wizardStepBusy || (isContractReviewStep && !contractAccepted)}
                        onClick={() => void handleNextStep()}
                      >
                        {wizardStepBusy ? 'Please wait…' : 'Next'}
                      </Button>
                    ) : (
                      <Button
                        key="wizard-submit-btn"
                        type="submit"
                        variant="primary"
                        disabled={submitting}
                      >
                        {submitting ? 'Submitting…' : 'Submit'}
                      </Button>
                    )}
                  </div>
                </div>
              </form>
            )}
          </div>
        </Surface>
      </div>
    );
  }

  const publicCommentsPanel = openEntry && perms.read_comments;

  const publicPanelNode = (
    <div className="flex flex-col h-full min-h-0 bg-[var(--bg)]">
      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-4">
        <CommentsPanel
          comments={comments}
          loading={commentsLoading}
          user={null}
          canComment={Boolean(perms.create_comments)}
          canReply={false}
        />
      </div>
      {perms.create_comments ? (
        <div className={COMMENT_FOOTER_CLASS}>
          <CommentComposer
            value={newCommentText}
            onChange={setNewCommentText}
            onSubmit={() => void handleSubmitComment()}
            submitting={postingComment}
            mentions={false}
          />
        </div>
      ) : null}
    </div>
  );

  const openEntryHeaderActions =
    openEntry && (showSideColumn && publicCommentsPanel || perms.update_entries) ? (
      <div className="flex items-center gap-1">
        {showSideColumn && publicCommentsPanel && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-10 h-10 sm:w-8 sm:h-8 p-0"
            onClick={() => setCommentsPanelOpen(o => !o)}
            aria-label="Toggle discussion panel"
            aria-pressed={commentsPanelOpen}
            icon={<MessageSquare size={14} strokeWidth={LINE_ICON_STROKE} />}
          />
        )}
        {perms.update_entries && !editMode ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-10 h-10 sm:w-8 sm:h-8 p-0"
            onClick={() => {
              seedOpenEntryForm(openEntry);
              setEditMode(true);
            }}
            // @ts-expect-error label is a source-contract marker for shared-comment tests
            label="Edit entry"
            aria-label="Edit entry"
            icon={<Edit2 size={14} strokeWidth={LINE_ICON_STROKE} />}
          />
        ) : null}
      </div>
    ) : null;

  // INTERACTIVE VIEWS LAYOUT MODE
  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col">
      {/* Top Header Bar */}
      <Surface as="header" tone="panel" border="none" radius="none" className="border-b border-[var(--panel-border)] sticky top-0 z-30 shadow-sm backdrop-blur-md bg-opacity-95">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div>
              <Text variant="body-lg" weight="bold" as="h1">{track.title}</Text>
              {data.workspace?.name && (
                <Text variant="subtitle" tone="muted" as="p" className="block">{data.workspace.name}</Text>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {perms.create_entries && (
              <Button
                variant="primary"
                size="sm"
                icon={<Plus size={14} />}
                onClick={() => {
                  setSubmittedSuccess(false);
                  setShowCreateModal(true);
                  setCurrentStepIndex(0);
                }}
              >
                {submitButtonLabel}
              </Button>
            )}
          </div>
        </div>
      </Surface>

      {/* View Tabs */}
      {viewTabOptions.length > 0 && activeView && (
        <Surface tone="panel" border="none" radius="none" className="border-b border-[var(--panel-border)]">
          <div className="max-w-6xl mx-auto px-4">
            <ViewTabs
              options={viewTabOptions}
              value={activeView.id}
              onChange={nextId => {
                const next = data.views.find(v => v.id === nextId);
                if (next) setActiveView(next);
              }}
              ariaLabel="Track views"
              noBorder
            />
          </div>
        </Surface>
      )}

      {/* Main Body */}
      <main className="max-w-6xl mx-auto w-full px-4 py-6 flex-1 flex flex-col animate-fade-in">
        {activeView ? (
          <ViewRenderer
            view={activeView}
            entries={entries}
            isLoading={entriesLoading}
            onEntryOpen={e => {
              if (perms.update_entries || perms.read_entries) {
                openEntryDialog(e, {
                  edit: false,
                  focusComments:
                    !perms.update_entries && Boolean(perms.read_comments),
                });
              }
            }}
            onEntryDelete={undefined}
            onEntryDeleteFailed={undefined}
            onEntryEdit={perms.update_entries ? (e => {
              openEntryDialog(e, { edit: true });
            }) : undefined}
            onEntryUpdate={perms.update_entries ? (async (updated) => {
              try {
                await publicSharingApi.updatePublicEntry(token, updated.id, {
                  title: updated.title,
                  body: updated.body,
                  custom_fields: updated.custom_fields
                });
                toast.showToast('Entry updated successfully', 'success');
                loadEntries();
              } catch (err: unknown) {
                toast.showToast(entrySaveErrorMessage(err, 'Failed to update entry'), 'error');
              }
            }) : undefined}
            onEntryPersist={perms.update_entries ? (async (updated) => {
              try {
                await publicSharingApi.updatePublicEntry(token, updated.id, {
                  title: updated.title,
                  body: updated.body,
                  custom_fields: updated.custom_fields
                });
                loadEntries();
              } catch (err: unknown) {
                toast.showToast(entrySaveErrorMessage(err, 'Failed to update entry'), 'error');
              }
            }) : undefined}
            onViewUpdate={undefined}
            onKanbanColumnEnumSync={undefined}
            onEntryCreate={perms.create_entries ? (async (input) => {
              // Kanban quick-add on the public page sends only the card title
              // plus the column's group value (e.g. {status: "draft"}). If the
              // target entry type has OTHER required fields the quick-add can't
              // supply (e.g. Content Piece's required "format"/"platform"), a
              // blind create 400s with "Field 'format' is required". Mirror the
              // authenticated TrackDetailPage behavior: route to the full create
              // modal pre-seeded with the title + column value so the visitor can
              // fill the remaining required fields, instead of erroring out.
              // Resolve the SAME entry type the widget is posting (it passes
              // input.type as a slug), not the page-level selectedEntryType —
              // those can differ (e.g. a stale "Post" type still lingering on
              // the track vs. the kanban's real "Content Piece"), and using the
              // wrong one would read an empty field list and skip the guard.
              const inputTypeSlug = input.type ? slug(String(input.type)) : '';
              const targetType =
                (inputTypeSlug &&
                  filteredEntryTypes.find((et: any) =>
                    entryTypeIdentitySlugs(et).includes(inputTypeSlug)
                  )) ||
                filteredEntryTypes.find(
                  (et: any) => et.id === selectedEntryType?.id
                ) ||
                selectedEntryType ||
                filteredEntryTypes[0];
              const typeFields = ((targetType?.form_schema?.fields ??
                []) as OperationalModelFieldSpec[]);
              const seeded = input.custom_fields ?? {};
              const missingRequired = getMissingRequiredFields(typeFields, seeded);
              let routeToCompose = input.source === 'calendar' || missingRequired.length > 0;
              if (!routeToCompose && activeView?.type === 'kanban') {
                const groupBy = resolveKanbanGroupBy(
                  (activeView.config as Record<string, unknown> | undefined)
                    ?.group_by
                );
                const groupWriteFieldKey = resolveKanbanWriteFieldKey(
                  groupBy,
                  typeFields
                );
                routeToCompose = shouldRouteKanbanQuickAddToCompose(
                  typeFields,
                  groupWriteFieldKey,
                  seeded
                );
              }
              if (routeToCompose) {
                if (targetType) setSelectedEntryType(targetType);
                setFormTitle(input.source === 'calendar' && input.title === 'New event' ? '' : input.title || '');
                setFormBody('');
                setFormCustomFields({ ...seeded });
                setCurrentStepIndex(0);
                setInvalidFieldKey(null);
                setShowCreateModal(true);
                return;
              }
              try {
                await publicSharingApi.createPublicEntry(token, {
                  title: input.title,
                  type_id: targetType?.id || filteredEntryTypes[0]?.id,
                  custom_fields: input.custom_fields
                });
                toast.showToast('Entry created successfully', 'success');
                loadEntries();
              } catch (err: unknown) {
                toast.showToast(entrySaveErrorMessage(err, 'Failed to create entry'), 'error');
              }
            }) : undefined}
            entryTypeSlugs={filteredEntryTypes.map(et => et.name ?? et.key ?? '')}
            entryTypes={filteredEntryTypes.map(
              (et): EntryTypeNode => ({
                id: et.id,
                name: et.name ?? et.key ?? et.id,
                form_schema: et.form_schema as unknown as EntryTypeNode['form_schema']
              }),
            )}
            trackDefaultEntryTypeKey={data.track.content_profile_defaults?.default_entry_type}
            fields={trackEntryTypeFields}
            filterType=""
            onFilterChange={() => {}}
            fetchMore={undefined}
            hasNextPage={false}
            isFetchingNext={false}
            isEditor={perms.create_entries || perms.update_entries}
            publicPermissions={perms}
            publicToken={token}
            track={track as any}
          />
        ) : (
          <div className="py-12 text-center">
            <Text variant="body-sm" tone="muted">No views configured.</Text>
          </div>
        )}
      </main>

      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title={submitButtonLabel}
      >
            <form onSubmit={handleSubmitEntry} className="px-4 sm:px-6 py-4 space-y-4 max-h-[80vh] overflow-y-auto">
              {filteredEntryTypes.length > 1 && (
                <div className="space-y-1.5">
                  <Text as="label" variant="label" tone="muted" weight="semibold" className="block">Entry Type</Text>
                  <Select
                    size="sm"
                    value={selectedEntryType?.id || ''}
                    onChange={e => {
                      const et = filteredEntryTypes.find(t => t.id === e.target.value);
                      if (et) {
                        setSelectedEntryType(et);
                        setFormCustomFields({});
                        setCurrentStepIndex(0);
                      }
                    }}
                  >
                    {filteredEntryTypes.map(et => (
                      <option key={et.id} value={et.id}>
                        {et.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              {/* Progress Indicators if wizard has multiple steps */}
              {renderWizardProgress(formSteps, currentStepIndex)}

              {/* Render fields for the current active step */}
              <div className="space-y-4">
                {formSteps[currentStepIndex] && renderStepFields(
                  formSteps[currentStepIndex],
                  formCustomFields,
                  (k, v) => {
                    setFormCustomFields(prev => ({ ...prev, [k]: v }));
                  },
                  'modal'
                )}
              </div>

              <div className="pt-4 border-t border-[var(--panel-border)] flex justify-between items-center">
                <div>
                  {formSteps.length > 1 && currentStepIndex > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handlePrevStep}
                    >
                      Back
                    </Button>
                  ) : (
                    <Button variant="outline" type="button" onClick={() => setShowCreateModal(false)}>
                      Cancel
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  {formSteps.length > 1 && currentStepIndex < formSteps.length - 1 ? (
                    <Button
                      key="modal-next-btn"
                      type="button"
                      variant="primary"
                      disabled={wizardStepBusy}
                      onClick={() => void handleNextStep()}
                    >
                      {wizardStepBusy ? 'Please wait…' : 'Next'}
                    </Button>
                  ) : (
                    <Button
                      key="modal-submit-btn"
                      variant="primary"
                      type="submit"
                      disabled={submitting}
                    >
                      {submitting ? 'Submitting…' : 'Submit'}
                    </Button>
                  )}
                </div>
              </div>
            </form>
      </Modal>

      {openEntry ? (
      <Modal
        open
        onClose={closeOpenEntry}
        title={openEntry.title || 'Entry'}
        headerActions={openEntryHeaderActions}
        hasCompanionPanel={Boolean(publicCommentsPanel)}
        sidePanel={
          showSideColumn && commentsPanelOpen && publicCommentsPanel
            ? publicPanelNode
            : undefined
        }
      >
          <div className="px-4 sm:px-6 py-4 sm:py-5">
            {!editMode ? (
              <>
                <EntryMetaFields
                  fields={
                    (openEntryType?.form_schema?.fields ??
                      []) as unknown as OperationalModelFieldSpec[]
                  }
                  values={(openEntry.custom_fields || {}) as Record<string, unknown>}
                  variant="detail"
                  readOnly
                />
                {openEntry.body ? (
                  <Text as="div" variant="body" className="mt-4 leading-[1.55]">
                    <MarkdownContent>{openEntry.body}</MarkdownContent>
                  </Text>
                ) : null}
                {!showSideColumn && (
                  commentsPanelOpen && publicCommentsPanel ? (
                    <div className="mt-6 border-t border-[var(--panel-border)] pt-4 min-h-[280px]">
                      {publicPanelNode}
                    </div>
                  ) : null
                )}
              </>
            ) : (
              <form onSubmit={handleUpdateEntry} className="space-y-4 max-h-[70vh] overflow-y-auto">
                {editTitleEnabled && (
                  <div className="space-y-1.5">
                    <Text as="label" variant="label" tone="muted" weight="semibold" className="block">
                      {editTitleLabel} <span className="text-red-500">*</span>
                    </Text>
                    <Input
                      type="text"
                      required
                      placeholder={editTitlePlaceholder}
                      value={editTitle}
                      onChange={e => {
                        setEditTitle(e.target.value);
                        if (invalidFieldKey === 'title') setInvalidFieldKey(null);
                      }}
                      invalid={invalidFieldKey === 'title'}
                      size="sm"
                    />
                  </div>
                )}

                {editBodyEnabled && (
                  <div className="space-y-1.5">
                    <Text as="label" variant="label" tone="muted" weight="semibold" className="block">{editBodyLabel}</Text>
                    <Textarea
                      rows={3}
                      placeholder={editBodyPlaceholder}
                      value={editBody}
                      onChange={e => {
                        setEditBody(e.target.value);
                        if (invalidFieldKey === 'body') setInvalidFieldKey(null);
                      }}
                      invalid={invalidFieldKey === 'body'}
                      size="sm"
                    />
                  </div>
                )}

                {renderFormFields(openEntryType, editCustomFields, (k, v) => {
                  setEditCustomFields(prev => ({ ...prev, [k]: v }));
                })}

                <div className="pt-4 border-t border-[var(--panel-border)] flex justify-end gap-2">
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => {
                      setEditMode(false);
                      seedOpenEntryForm(openEntry);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button variant="primary" type="submit" disabled={submitting}>
                    {submitting ? 'Saving…' : 'Save Changes'}
                  </Button>
                </div>
              </form>
            )}
          </div>
      </Modal>
      ) : null}
    </div>
  );
}
