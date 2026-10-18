import type { ReactNode } from 'react';
import { RelationValue } from '../../../components/entries/relations/RelationValue';
import { Surface, Text } from '../../../ui';
import type { StagedChange } from './types';

interface InputLabels {
  title?: string;
  property_order?: string[];
  properties?: Record<string, InputLabels>;
  items?: InputLabels;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function operationInput(staged: StagedChange): Record<string, unknown> | null {
  const machine = staged.diff_machine;
  const supported = staged.kind === 'invoke_app_operation' || staged.kind === 'call_workspace_tool';
  return supported && machine?.op === staged.kind && isObject(machine.input)
    ? machine.input : null;
}

function fieldLabel(key: string, labels?: InputLabels): string {
  const title = typeof labels?.title === 'string' ? labels.title.trim() : '';
  if (title) return title;
  const words = key.replace(/[_-]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Literal, read-only projection of the bound operation or workspace tool input; never parse narrated JSON. */
export function StagedOperationInputs({ staged, onNavigate }: {
  staged: StagedChange;
  onNavigate?: () => void;
}) {
  const input = operationInput(staged);
  if (!input) return null;
  const review = isObject(staged.diff_machine.review) ? staged.diff_machine.review : {};
  const labels = isObject(review.input_labels) ? review.input_labels as InputLabels : undefined;
  let remaining = 256;
  let omitted = false;

  function valueView(value: unknown, schema: InputLabels | undefined, depth: number, reference = false): ReactNode {
    if (--remaining < 0 || depth > 8) {
      omitted = true;
      return null;
    }
    if (Array.isArray(value)) {
      if (!value.length) return <Text variant="body-sm" tone="muted">None</Text>;
      return <ol className="flex flex-col gap-3">
        {value.slice(0, 256).map((item, i) => <li key={i}>
          <Surface tone="panel-2" border="default" radius="input" className="min-w-0 p-3">
            <Text variant="meta" tone="subtle" as="p" className="mb-2 block">Item {i + 1}</Text>
            {valueView(item, schema?.items, depth + 1, reference)}
          </Surface>
        </li>)}
        {value.length > 256 ? (omitted = true, null) : null}
      </ol>;
    }
    if (isObject(value)) {
      // App schema order is presentation only. Keep every unlabelled input too;
      // object arrival/storage order must not push the main decision to the end.
      const declared = schema?.properties ?? {};
      const preferred = Array.isArray(schema?.property_order)
        ? schema.property_order.slice(0, 256).filter(key => typeof key === 'string') : [];
      const keys = [...new Set([...preferred, ...Object.keys(declared), ...Object.keys(value)])]
        .filter(key => Object.prototype.hasOwnProperty.call(value, key));
      const entries = keys.map(key => [key, value[key]] as const);
      if (!entries.length) return <Text variant="body-sm" tone="muted">None</Text>;
      return <dl className="flex min-w-0 flex-col gap-3">
        {entries.slice(0, 256).map(([key, child]) => <div key={key} className="min-w-0">
          <dt><Text variant="meta" tone="subtle">{fieldLabel(key, schema?.properties?.[key])}</Text></dt>
          <dd className="mt-1 min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
            {valueView(child, schema?.properties?.[key], depth + 1, /(^id$|_ids?$)/.test(key))}
          </dd>
        </div>)}
        {entries.length > 256 ? (omitted = true, null) : null}
      </dl>;
    }
    if (reference && typeof value === 'string' && /^n\.(Entry|Track)\.[\w-]+$/.test(value)) {
      return <RelationValue value={value} relation={{ target: value.startsWith('n.Track.') ? 'track' : 'entry' }} onNavigate={onNavigate} />;
    }
    const literal = value === null ? 'Not set' : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
    return <Text variant="body-sm" as="span">{literal === '' ? 'Empty text' : literal}</Text>;
  }

  const fields = valueView(input, labels, 0);
  return <div className="flex min-w-0 flex-col gap-3">
    {fields}
    {omitted ? <Text variant="meta" tone="muted" as="p">
      This input is too large to show completely here. Inspect the complete input in Technical details before approving.
    </Text> : null}
  </div>;
}
