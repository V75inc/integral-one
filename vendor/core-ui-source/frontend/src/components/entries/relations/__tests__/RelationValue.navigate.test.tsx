import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { RelationValue } from '../RelationValue';

vi.mock('../useRelationLabels', () => ({
  useRelationLabels: () => ({
    targets: [{ id: 't-1', label: 'Details track', kind: 'track' as const }],
    loading: false,
  }),
}));

vi.mock('../routeForRelationTarget', () => ({
  routeForRelationTarget: () => '/tracks/t-1',
}));

describe('RelationValue onNavigate', () => {
  it('calls onNavigate before following an internal link', () => {
    const onNavigate = vi.fn();
    render(
      <MemoryRouter>
        <RelationValue
          value="t-1"
          relation={{ target: 'track' }}
          onNavigate={onNavigate}
        />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('link', { name: 'Details track' }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
