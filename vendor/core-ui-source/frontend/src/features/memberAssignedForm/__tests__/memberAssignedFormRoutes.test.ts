import { describe, expect, it } from 'vitest';

import {
  LEGACY_MEMBER_ASSIGNED_FORM_PATH,
  MEMBER_ASSIGNED_FORM_PATH,
  isMemberAssignedFormPathname,
  resolveMemberAssignedFormNavigateTarget,
} from '../memberAssignedFormRoutes';

describe('resolveMemberAssignedFormNavigateTarget', () => {
  it('maps legacy public share URLs to member route with entry', () => {
    const legacy =
      'http://localhost:9006/public/tracks/tok123?entry=n.Entry.abc';
    expect(resolveMemberAssignedFormNavigateTarget(legacy)).toBe(
      `${MEMBER_ASSIGNED_FORM_PATH}?entry=n.Entry.abc`,
    );
  });

  it('rewrites legacy HR path to canonical route', () => {
    expect(
      resolveMemberAssignedFormNavigateTarget(
        `${LEGACY_MEMBER_ASSIGNED_FORM_PATH}?entry=n.Entry.xyz`,
      ),
    ).toBe(`${MEMBER_ASSIGNED_FORM_PATH}?entry=n.Entry.xyz`);
  });
});

describe('isMemberAssignedFormPathname', () => {
  it('matches canonical and legacy routes', () => {
    expect(isMemberAssignedFormPathname('/me/assigned-form')).toBe(true);
    expect(isMemberAssignedFormPathname('/hr/employee-onboarding')).toBe(true);
  });
});
