/**
 * RestrictedRelationStub — leak-prevention tests.
 *
 * Phase 10 Plan 10-06 (APP-CROSS-RELATIONS-01). Architectural Decision 8.
 *
 * The renderer must NEVER expose source-field content. The test fixture
 * uses an unmistakable leak-canary string for relation_field_key so any
 * accidental visible render would surface it in queries.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { RestrictedRelationStub } from './RestrictedRelationStub';

describe('RestrictedRelationStub', () => {
  afterEach(() => cleanup());

  it('renders the generic Restricted label', () => {
    render(<RestrictedRelationStub relationFieldKey="employees" />);
    expect(screen.getByText('Restricted')).toBeInTheDocument();
  });

  it('exposes the relation_field_key via aria-label ONLY (assistive tech)', () => {
    render(<RestrictedRelationStub relationFieldKey="LEAK_CANARY_employees" />);
    const stub = screen.getByTestId('restricted-relation-stub');
    expect(stub).toHaveAttribute(
      'aria-label',
      'Restricted relation field LEAK_CANARY_employees',
    );
  });

  it('does NOT render the relation_field_key in visible text', () => {
    render(<RestrictedRelationStub relationFieldKey="LEAK_CANARY_employees" />);
    // The leak canary may appear in aria/title attributes (assistive-tech
    // surfaces), but it must NOT appear in any visible text node.
    const visibleText = screen.getByTestId('restricted-relation-stub').textContent || '';
    expect(visibleText).not.toContain('LEAK_CANARY');
    expect(visibleText).not.toContain('employees');
    expect(visibleText).toBe('Restricted');
  });

  it('shows a tooltip explaining the permission state', () => {
    render(<RestrictedRelationStub relationFieldKey="r" />);
    const stub = screen.getByTestId('restricted-relation-stub');
    expect(stub).toHaveAttribute(
      'title',
      "You don't have permission to view this referenced entry.",
    );
  });

  it('defaults targetResourceKind to entry in tooltip', () => {
    render(<RestrictedRelationStub relationFieldKey="r" />);
    const stub = screen.getByTestId('restricted-relation-stub');
    const title = stub.getAttribute('title') || '';
    expect(title).toContain('referenced entry');
  });
});
