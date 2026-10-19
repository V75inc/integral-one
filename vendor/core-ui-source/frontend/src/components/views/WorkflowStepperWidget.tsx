import { Check, Circle } from 'lucide-react';
import { Surface, Text } from '../../ui';
import type { ViewWidgetProps } from './types';

type Step = { key: string; label: string; description?: string; statuses?: string[] };

export function WorkflowStepperWidget({ view, entries, isLoading }: ViewWidgetProps) {
  const config = (view.config || {}) as { status_field?: string; steps?: Step[] };
  const entry = entries[0];
  const status = String(entry?.custom_fields?.[config.status_field || 'status'] || 'draft');
  const steps = config.steps || [];
  const current = Math.max(0, steps.findIndex(step => (step.statuses || [step.key]).includes(status)));
  if (isLoading) return <Surface tone="panel-2" radius="card" className="h-20 animate-pulse">{null}</Surface>;
  return (
    <Surface tone="panel" border="default" radius="card" padding="md" data-testid="workflow-stepper-widget">
      <div className="flex items-start gap-2 overflow-x-auto">
        {steps.map((step, index) => {
          const complete = index < current;
          const active = index === current;
          return <div key={step.key} className="flex min-w-[120px] flex-1 items-start gap-2">
            <Text
              as="div"
              variant="body"
              tone={complete || active ? 'inherit' : 'subtle'}
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${complete || active ? 'border-[var(--link)] bg-[var(--link)] text-white' : 'border-[var(--panel-border)]'}`}
            >
              {complete ? <Check size={14} aria-hidden="true" /> : active ? <span className="h-2 w-2 rounded-full bg-white" /> : <Circle size={12} aria-hidden="true" />}
            </Text>
            <div className="min-w-0">
              <Text as="div" variant="body-sm" weight="medium">{step.label}</Text>
              {step.description && <Text as="div" variant="meta" tone="muted">{step.description}</Text>}
            </div>
            {index < steps.length - 1 && <div className="mt-3 h-px flex-1 bg-[var(--panel-border)]" />}
          </div>;
        })}
      </div>
    </Surface>
  );
}
