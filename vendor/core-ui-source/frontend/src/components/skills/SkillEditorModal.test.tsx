import { describe, expect, it } from 'vitest';

import { skillBadges } from './SkillEditorModal';
import type { SkillSummary } from '../../api/skills';

describe('skillBadges', () => {
  it('marks core and customized skills', () => {
    const skill: SkillSummary = {
      id: 'core:integral-filing',
      source: 'core',
      read_only: true,
      key: 'integral-filing',
      name: 'Filing',
      description: '',
      kind: 'declarative',
      enabled: true,
      customized: false,
      stale_default: false,
      tools_required: [],
    };
    expect(skillBadges(skill)).toContain('Core');
  });

  it('shows stale default badge', () => {
    const skill: SkillSummary = {
      id: 'skill-1',
      source: 'app',
      read_only: false,
      key: 'lead_intake',
      name: 'Lead intake',
      description: '',
      kind: 'declarative',
      enabled: true,
      customized: true,
      stale_default: true,
      tools_required: [],
    };
    expect(skillBadges(skill)).toEqual(
      expect.arrayContaining(['Customized', 'Default updated']),
    );
  });
});
