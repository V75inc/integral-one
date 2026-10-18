import { Field } from '../../patterns/Field';
import { Input, Text } from '../../ui';
import type { DocumentLayout } from './api';
import {
  normalizePageSize,
  type MarginsInches,
  type PageSizeKey,
} from './documentTheme';
import { MiniRichTextEditor } from './MiniRichTextEditor';
import { PageLayoutPreview } from './PageLayoutPreview';
import {
  MARGIN_PRESET_OPTIONS,
  PAGE_SIZE_OPTIONS,
  type LayoutSourceMode,
} from './pageLayoutUi';

export interface PageLayoutFormValues {
  layoutSource: LayoutSourceMode;
  layoutId: string;
  layoutName: string;
  pageSize: PageSizeKey;
  marginPreset: string;
  pageNumbers: boolean;
  headerHtml: string;
  footerHtml: string;
}

interface Props {
  values: PageLayoutFormValues;
  margins: MarginsInches;
  savedLayouts: DocumentLayout[];
  layoutsLoading?: boolean;
  showLayoutPicker?: boolean;
  showLayoutName?: boolean;
  onChange: (patch: Partial<PageLayoutFormValues>) => void;
  onSelectSavedLayout: (layoutId: string) => void;
  onStartCustom: () => void;
}

export function PageLayoutFormFields({
  values,
  margins,
  savedLayouts,
  layoutsLoading,
  showLayoutPicker = true,
  showLayoutName = false,
  onChange,
  onSelectSavedLayout,
  onStartCustom,
}: Props) {
  return (
    <div className="page-layout-form grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(220px,340px)] gap-6 xl:gap-8">
      <div className="page-layout-form__controls space-y-6 min-w-0">
        {showLayoutPicker ? (
          <section className="space-y-3">
            <div>
              <Text variant="heading-sm" as="h4">
                Starting point
              </Text>
              <Text variant="body-sm" tone="muted" className="mt-1 max-w-prose">
                Pick a saved letterhead or start with a blank page. You can still
                adjust everything below.
              </Text>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={`page-layout-chip${values.layoutSource === 'custom' ? ' page-layout-chip--active' : ''}`}
                onClick={onStartCustom}
              >
                Start fresh
              </button>
              {layoutsLoading ? (
                <span className="page-layout-chip page-layout-chip--loading">
                  Loading saved layouts…
                </span>
              ) : null}
              {savedLayouts.map((layout, index) => (
                <button
                  key={layout.id}
                  type="button"
                  className={`page-layout-chip${
                    values.layoutSource === 'saved' && values.layoutId === layout.id
                      ? ' page-layout-chip--active'
                      : ''
                  }`}
                  style={{ animationDelay: `${index * 60}ms` }}
                  onClick={() => onSelectSavedLayout(layout.id)}
                >
                  {layout.name}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {showLayoutName ? (
          <Field
            label="Layout name"
            hint="A name your team will recognize, e.g. Company letterhead"
            htmlFor="page-layout-name"
          >
            <Input
              id="page-layout-name"
              value={values.layoutName}
              placeholder="Standard letterhead"
              onChange={e => onChange({ layoutName: e.target.value })}
            />
          </Field>
        ) : null}

        <section className="space-y-3">
          <div>
            <Text variant="heading-sm" as="h4">
              Paper size
            </Text>
            <Text variant="body-sm" tone="muted" className="mt-1">
              Choose the paper size your PDF will use when printed.
            </Text>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {PAGE_SIZE_OPTIONS.map((opt, index) => (
              <button
                key={opt.key}
                type="button"
                className={`page-layout-option${
                  values.pageSize === opt.key ? ' page-layout-option--active' : ''
                }`}
                style={{ animationDelay: `${index * 70}ms` }}
                onClick={() => onChange({ pageSize: normalizePageSize(opt.key) })}
              >
                <span className="page-layout-option__label">{opt.label}</span>
                <span className="page-layout-option__detail">{opt.detail}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <Text variant="heading-sm" as="h4">
              Page margins
            </Text>
            <Text variant="body-sm" tone="muted" className="mt-1">
              How much empty space to leave around the edges.
            </Text>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {MARGIN_PRESET_OPTIONS.map((opt, index) => (
              <button
                key={opt.key}
                type="button"
                className={`page-layout-option page-layout-option--margin${
                  values.marginPreset === opt.key ? ' page-layout-option--active' : ''
                }`}
                style={{ animationDelay: `${index * 70}ms` }}
                onClick={() => onChange({ marginPreset: opt.key })}
              >
                <MarginDiagram preset={opt.key} active={values.marginPreset === opt.key} />
                <span className="page-layout-option__label">{opt.label}</span>
                <span className="page-layout-option__detail">{opt.hint}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <label className="page-layout-toggle flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 shrink-0"
              checked={values.pageNumbers}
              onChange={e => onChange({ pageNumbers: e.target.checked })}
            />
            <span>
              <Text variant="label" as="span" className="block">
                Show page numbers
              </Text>
              <Text variant="body-sm" tone="muted" className="mt-0.5">
                Adds &quot;Page 1&quot;, &quot;Page 2&quot;, and so on at the bottom of
                exported PDFs.
              </Text>
            </span>
          </label>
        </section>

        <section className="space-y-4">
          <div>
            <Text variant="heading-sm" as="h4">
              Top and bottom text
            </Text>
            <Text variant="body-sm" tone="muted" className="mt-1 max-w-prose">
              Optional letterheads that repeat on every page. Copy your existing
              header from Word or a browser and paste it here (images included), or
              build one with the toolbar and Layout options.
            </Text>
          </div>
          <MiniRichTextEditor
            label="Top of every page"
            html={values.headerHtml}
            onChange={html => onChange({ headerHtml: html })}
            placeholder="e.g. Acme Corp · 1200 Market St"
          />
          <MiniRichTextEditor
            label="Bottom of every page"
            html={values.footerHtml}
            onChange={html => onChange({ footerHtml: html })}
            placeholder="e.g. Confidential · acme.example"
          />
        </section>
      </div>

      <div className="page-layout-form__preview xl:sticky xl:top-6 self-start w-full flex justify-center xl:justify-end">
        <PageLayoutPreview
          pageSize={values.pageSize}
          margins={margins}
          headerHtml={values.headerHtml}
          footerHtml={values.footerHtml}
          pageNumbers={values.pageNumbers}
        />
      </div>
    </div>
  );
}

function MarginDiagram({ preset, active }: { preset: string; active: boolean }) {
  const inset =
    preset === 'narrow' ? '14%' : preset === 'wide' ? '6% 22% 6% 22%' : '10%';
  return (
    <span
      className={`page-layout-margin-diagram${active ? ' page-layout-margin-diagram--active' : ''}`}
      aria-hidden="true"
    >
      <span
        className="page-layout-margin-diagram__content"
        style={{ inset }}
      />
    </span>
  );
}
