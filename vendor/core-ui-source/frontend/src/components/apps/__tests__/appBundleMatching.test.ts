import { describe, it, expect } from 'vitest';
import { extractPackageMeta, isPackageInstalled } from '../appBundleMatching';
import type { App, OperationalModelNode } from '../../../types';

function libraryProfile(overrides: Partial<OperationalModelNode> = {}): OperationalModelNode {
  return {
    id: 'n.OperationalModel.abc123',
    name: 'Guyana Payroll',
    description: 'Run payroll for Guyana.',
    library_package: true,
    manifest: {
      scope: 'app',
      // The compiled manifest canonicalizes `package.name` to the slug and
      // drops `package.slug` — this is the real shape returned by
      // `GET /operational-models` today (see operational_model_library_sync.py).
      package: { name: 'payroll-app', trust_tier: 'trusted', tags: ['payroll'] },
    },
    metadata: { slug: 'payroll-app' },
    ...overrides,
  };
}

describe('extractPackageMeta', () => {
  it('reads the slug from metadata.slug, not the compiled package.name', () => {
    const meta = extractPackageMeta(libraryProfile());
    expect(meta.name).toBe('Guyana Payroll');
    expect(meta.slug).toBe('payroll-app');
  });

  it('falls back to package.slug for a manifest shape that still has it', () => {
    const profile = libraryProfile({
      metadata: undefined,
      manifest: {
        scope: 'app',
        package: { name: 'Guyana Payroll', slug: 'payroll-app' },
      },
    });
    expect(extractPackageMeta(profile).slug).toBe('payroll-app');
  });

  it('returns an empty slug when neither source has one', () => {
    const profile = libraryProfile({ metadata: undefined, manifest: { scope: 'app', package: {} } });
    expect(extractPackageMeta(profile).slug).toBe('');
  });
});

describe('isPackageInstalled', () => {
  it('matches an installed app by slug via metadata.slug', () => {
    const profile = libraryProfile();
    const apps: App[] = [
      { id: 'n.App.1', source_operational_model_slug: 'payroll-app' } as App,
    ];
    expect(isPackageInstalled(profile, apps)).toBe(true);
  });
});
