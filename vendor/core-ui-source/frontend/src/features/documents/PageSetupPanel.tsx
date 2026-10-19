import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../../components/ui/collapsible';
import { Surface, Text } from '../../ui';
import { useToast } from '../../context/ToastContext';
import { agentiveErrorMessage } from '../../api/helpers';
import { documentsApi, type DocumentTemplateVersion } from './api';
import {
  DEFAULT_PAGE_SIZE,
  MARGIN_PRESETS,
  normalizeMargins,
  normalizePageSize,
  type MarginsInches,
  type PageSizeKey,
} from './documentTheme';
import {
  PageLayoutFormFields,
  type PageLayoutFormValues,
} from './PageLayoutFormFields';
import { marginPresetKeyFor } from './pageLayoutUi';

export interface PageSettings {
  layoutId: string;
  pageSize: PageSizeKey;
  margins: MarginsInches;
  pageNumbers: boolean;
  headerHtml: string;
  footerHtml: string;
}

interface Props {
  workspaceId: string;
  versionId: string;
  version?: DocumentTemplateVersion | null;
  onPageSettingsChange: (settings: PageSettings) => void;
}

function headerFooterFromVersion(version?: DocumentTemplateVersion | null) {
  const hf = (version?.header_footer || {}) as Record<string, unknown>;
  return {
    headerHtml: String(hf.header_html || ''),
    footerHtml: String(hf.footer_html || ''),
  };
}

function formFromVersion(version?: DocumentTemplateVersion | null): PageLayoutFormValues {
  const hf = headerFooterFromVersion(version);
  const raw = (version?.header_footer || {}) as Record<string, unknown>;
  const pageSize = normalizePageSize(
    raw.page_size ? String(raw.page_size) : DEFAULT_PAGE_SIZE,
  );
  const margins = normalizeMargins(
    raw.margins && typeof raw.margins === 'object'
      ? (raw.margins as Partial<MarginsInches>)
      : null,
  );
  const layoutId = version?.layout_id || '';
  return {
    layoutSource: layoutId ? 'saved' : 'custom',
    layoutId,
    layoutName: '',
    pageSize,
    marginPreset: marginPresetKeyFor(margins),
    pageNumbers: !('page_numbers' in raw) || Boolean(raw.page_numbers),
    headerHtml: hf.headerHtml,
    footerHtml: hf.footerHtml,
  };
}

export function PageSetupPanel({
  workspaceId,
  versionId,
  version,
  onPageSettingsChange,
}: Props) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const layoutsQ = useQuery({
    queryKey: ['document-layouts', workspaceId],
    queryFn: () => documentsApi.listLayouts(),
  });

  const [form, setForm] = useState<PageLayoutFormValues>(() => formFromVersion(version));
  const [savedFlash, setSavedFlash] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const savedLayouts = layoutsQ.data?.layouts || [];
  const margins = MARGIN_PRESETS[form.marginPreset] || MARGIN_PRESETS.normal;

  const selectedLayout = useMemo(
    () => savedLayouts.find(l => l.id === form.layoutId),
    [form.layoutId, savedLayouts],
  );

  useEffect(() => {
    setForm(formFromVersion(version));
  }, [version?.layout_id, version?.header_footer]);

  const patchForm = useCallback((patch: Partial<PageLayoutFormValues>) => {
    setForm(prev => ({ ...prev, ...patch }));
  }, []);

  const applySavedLayout = useCallback(
    (layoutId: string) => {
      const layout = savedLayouts.find(l => l.id === layoutId);
      if (!layout) return;
      const m = normalizeMargins(layout.margins as Partial<MarginsInches>);
      patchForm({
        layoutSource: 'saved',
        layoutId,
        pageSize: normalizePageSize(layout.page_size),
        marginPreset: marginPresetKeyFor(m),
        pageNumbers: layout.page_numbers !== false,
        headerHtml: layout.header_html || '',
        footerHtml: layout.footer_html || '',
      });
    },
    [patchForm, savedLayouts],
  );

  const startCustom = useCallback(() => {
    patchForm({
      layoutSource: 'custom',
      layoutId: '',
      layoutName: '',
    });
  }, [patchForm]);

  useEffect(() => {
    onPageSettingsChange({
      layoutId: form.layoutId,
      pageSize: form.pageSize,
      margins,
      pageNumbers: form.pageNumbers,
      headerHtml: form.headerHtml,
      footerHtml: form.footerHtml,
    });
  }, [
    form.layoutId,
    form.pageSize,
    form.pageNumbers,
    form.headerHtml,
    form.footerHtml,
    margins,
    onPageSettingsChange,
  ]);

  const saveM = useMutation({
    mutationFn: async () => {
      let lid = form.layoutId;
      if (!lid) {
        const created = await documentsApi.createLayout({
          name: form.layoutName.trim() || 'Letterhead',
          page_size: form.pageSize,
          margins,
          page_numbers: form.pageNumbers,
          header_html: form.headerHtml,
          footer_html: form.footerHtml,
        });
        lid = created.id;
        patchForm({ layoutId: lid, layoutSource: 'saved', layoutName: '' });
      }
      await documentsApi.updateVersion(versionId, {
        layout_id: lid,
        header_footer: {
          header_html: form.headerHtml,
          footer_html: form.footerHtml,
          page_size: form.pageSize,
          margins,
          page_numbers: form.pageNumbers,
        },
      });
      return lid;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['document-layouts', workspaceId] });
      qc.invalidateQueries({ queryKey: ['document-template'] });
      setSavedFlash(true);
      showToast('Page appearance saved', 'success');
      window.setTimeout(() => setSavedFlash(false), 2000);
    },
    onError: err => {
      showToast(agentiveErrorMessage(err, 'Could not save page appearance'), 'error');
    },
  });

  return (
    <Surface as="section" padding="lg" className="page-setup-panel">
      <Collapsible open={panelOpen} onOpenChange={setPanelOpen}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <CollapsibleTrigger className="page-setup-panel__trigger group flex flex-1 min-w-0 items-start gap-2.5 rounded-md text-left">
            <Text as="span" tone="muted" className="mt-0.5 shrink-0">
              <ChevronDown
                size={18}
                strokeWidth={2}
                className="page-setup-panel__chevron"
                aria-hidden
              />
            </Text>
            <div className="min-w-0 max-w-xl flex-1">
              <Text variant="heading-sm" as="h3">
                Page appearance
              </Text>
              <Text variant="body-sm" tone="muted" className="mt-1">
                Set paper size, margins, and repeating text for the top and bottom of
                each page. Changes apply when you export or publish this template.
              </Text>
              {selectedLayout && form.layoutSource === 'saved' ? (
                <Text variant="body-sm" tone="muted" className="mt-2">
                  Based on saved layout:{' '}
                  <Text as="span" variant="body-sm" weight="medium">{selectedLayout.name}</Text>
                </Text>
              ) : null}
            </div>
          </CollapsibleTrigger>
          <Button
            size="sm"
            variant="secondary"
            className="shrink-0 self-start active:scale-[0.98] transition-transform"
            disabled={!versionId || saveM.isPending}
            onClick={() => saveM.mutate()}
          >
            {saveM.isPending ? 'Saving…' : savedFlash ? 'Saved' : 'Save page appearance'}
          </Button>
        </div>

        <CollapsibleContent className="page-setup-panel__content">
          <PageLayoutFormFields
            values={form}
            margins={margins}
            savedLayouts={savedLayouts}
            layoutsLoading={layoutsQ.isLoading}
            showLayoutPicker
            showLayoutName={form.layoutSource === 'custom' && !form.layoutId}
            onChange={patchForm}
            onSelectSavedLayout={applySavedLayout}
            onStartCustom={startCustom}
          />
        </CollapsibleContent>
      </Collapsible>
    </Surface>
  );
}
