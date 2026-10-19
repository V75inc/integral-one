/**
 * Section — generic content section with header + actions + body.
 *
 * Generalizes the existing `SettingsSection` from
 * `features/settings/components/Field.tsx`. Use anywhere a titled,
 * bordered panel groups a stack of related content (forms, lists, key/
 * value tables, settings groups).
 *
 * Layer: Pattern (Layer 2 — composes `<Surface>` + `<Text>`).
 *
 * Usage:
 *   <Section
 *     title="API Keys"
 *     description="Tokens you've issued. Revoke any compromised key."
 *     actions={<Button>Generate</Button>}
 *   >
 *     <KeysList />
 *   </Section>
 */

import { type ReactNode } from 'react';

import { Surface, Text } from '../ui';

export interface SectionProps {
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned action cluster in the header. */
  actions?: ReactNode;
  children: ReactNode;
}

export function Section({ title, description, actions, children }: SectionProps) {
  return (
    <Surface as="section" border="subtle" radius="card" padding="lg">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Text variant="body" weight="semibold" as="h3">
            {title}
          </Text>
          {description && (
            <Text variant="subtitle" tone="muted" as="p" className="mt-0.5">
              {description}
            </Text>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </header>
      <div className="flex flex-col gap-4">{children}</div>
    </Surface>
  );
}
