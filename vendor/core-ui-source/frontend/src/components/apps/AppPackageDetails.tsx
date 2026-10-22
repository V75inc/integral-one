import { useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { OperationalModelNode } from '../../types';
import { AppIcon, Surface, Text } from '../../ui';
import { Button } from '../ui';
import { buildManifestInspection } from '../../lib/operationalModelManifest';
import { countManifestSeedEntries } from '../../utils/manifestSeeds';
import { extractPackageMeta } from './appBundleMatching';

/** Read-only package inspection, alongside the existing installation selection. */
export function AppPackageDetails({ profile, onBack }: { profile: OperationalModelNode; onBack(): void }) {
  const heading = useRef<HTMLDivElement>(null);
  useEffect(() => { heading.current?.focus(); }, [profile.id]);
  const { name, description, slug } = extractPackageMeta(profile);
  const inspection = buildManifestInspection(profile.manifest);
  const { operational } = inspection;
  return <div className="space-y-5 break-words py-4" data-testid="app-package-details">
    <div ref={heading} tabIndex={-1}><Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={onBack}>Back to library</Button></div>
    <div className="flex items-start gap-3"><AppIcon name={name} /><div><Text as="h3" variant="heading-md">{name}</Text><Text as="p" variant="meta" tone="muted">{[profile.version && `Version ${profile.version}`, profile.scope, slug].filter(Boolean).join(' · ')}</Text></div></div>
    <Text as="p" className="whitespace-pre-wrap break-words">{description || 'No description supplied.'}</Text>
    {inspection.packageDescription && inspection.packageDescription !== description && <Text as="p" className="whitespace-pre-wrap break-words" tone="muted">{inspection.packageDescription}</Text>}
    <Text as="p" variant="body-sm" tone="muted">{countManifestSeedEntries(profile.manifest || {})} optional example records</Text>
    <Text as="h4" variant="heading-sm">Tracks and records</Text>
    {!inspection.sections.length && <Text as="p" tone="muted">No track definitions supplied.</Text>}
    {inspection.sections.map((section, index) => <Surface key={section.key || index} border="subtle" radius="card" padding="md" className="space-y-3">
      <Text as="h4" weight="semibold">{section.name}</Text>
      {section.description && <Text as="p" variant="body-sm" className="whitespace-pre-wrap">{section.description}</Text>}
      <Text as="h5" weight="medium" variant="body-sm">Record types ({section.entryTypes.length})</Text>
      {section.entryTypes.map((type, i) => <details key={type.key || i} className="rounded-lg border border-[var(--panel-border)] p-3"><summary className="cursor-pointer"><Text as="span" variant="body-sm">{type.name} · {type.fields.length} {type.fields.length === 1 ? 'field' : 'fields'}</Text></summary><ul className="mt-2 space-y-1">{type.fields.map((field, j) => <li key={field.key || j}><Text variant="meta">{field.name} · {field.key} · {field.type}</Text></li>)}</ul></details>)}
      <Text as="h5" weight="medium" variant="body-sm">Tags ({section.tags.length})</Text><Text as="p" variant="body-sm" tone="muted">{section.tags.map(tag => `${tag.groupName ? `${tag.groupName}: ` : ''}${tag.name}`).join(', ') || 'None'}</Text>
      <Text as="h5" weight="medium" variant="body-sm">Views ({section.views.length})</Text><ul>{section.views.map((view, i) => <li key={view.key || i}><Text variant="body-sm">{view.name} ({view.viewType}){view.isDefault ? ' · default' : ''}</Text></li>)}</ul>
    </Surface>)}
    <Surface border="subtle" radius="card" padding="md" className="space-y-3">
      <Text as="h4" variant="heading-sm">Skills and automation</Text>
      <Text as="p" variant="body-sm">Skills ({operational.skills.length}): {operational.skills.map(skill => `${skill.key} (${skill.kind})`).join(', ') || 'None'}</Text>
      <Text as="p" variant="body-sm">Agents ({operational.agents.length}): {operational.agents.map(agent => `${agent.name} (${agent.key})`).join(', ') || 'None'}</Text>
      <Text as="p" variant="body-sm">Tools ({operational.tools.length}): {operational.tools.join(', ') || 'None'}</Text>
      <Text as="p" variant="body-sm">{operational.hookCount} automation hooks</Text>
    </Surface>
  </div>;
}
