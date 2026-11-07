import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { operationInput, StagedOperationInputs } from '../StagedOperationInputs';
import type { StagedChange } from '../types';

vi.mock('../../../../components/entries/relations/RelationValue', () => ({
  RelationValue: ({ value }: { value: string }) => <a href={`/entries/${value}`}>Resolved record title</a>,
}));

function staged(input: unknown, extra: Record<string, unknown> = {}): StagedChange {
  return {
    _kind: 'staged_change', token: 'literal-input', kind: 'invoke_app_operation',
    summary: 'Run selected operation', diff_human: 'Narrated alternative values',
    diff_machine: { op: 'invoke_app_operation', input, ...extra },
    state: 'pending', created_at: '', expires_at: '', autonomy_grant_used: false,
  };
}
afterEach(cleanup);

describe('literal operation review', () => {
  it('renders every batch command input literally with its record reference and distinct value', () => {
    const child = (id: string, value: number) => ({ kind: 'call_workspace_tool', summary: 'Apply record change',
      diff_machine: { op: 'call_workspace_tool', input: { entry_id: id, value, note: '<script>literal</script>' } },
    });
    const proposal = { ...staged({}), kind: 'batch', diff_machine: {
      operations: [child('n.Entry.first', 12), child('n.Entry.second', 27)],
    } };
    const before = JSON.stringify(proposal);
    const { container } = render(<StagedOperationInputs staged={proposal} />);
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('27')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Resolved record title' })).toHaveLength(2);
    expect(container.querySelector('script')).toBeNull();
    expect(JSON.stringify(proposal)).toBe(before);
  });
  it('keeps the original step number when command inputs accompany other batch changes', () => {
    const proposal = { ...staged({}), kind: 'batch', diff_machine: { operations: [
      { kind: 'create_tag', summary: 'Create a tag' },
      { kind: 'call_workspace_tool', summary: 'Apply record change', diff_machine: { op: 'call_workspace_tool', input: { value: 12 } } },
    ] } };
    render(<StagedOperationInputs staged={proposal} />);
    expect(screen.getByText('2. Apply record change')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });
  it('uses declared presentation order and retains unlabelled inputs without mutating them', () => {
    const proposal = staged({ diagnostic: 'Trace value', sources: 'Source value', main: 'Main decision' }, {
      review: { input_labels: { properties: { main: { title: 'Primary decision' }, sources: { title: 'Supporting material' } } } },
    });
    const before = JSON.stringify(proposal);
    const { container } = render(<StagedOperationInputs staged={proposal} />);
    expect([...container.querySelectorAll('dt')].map(node => node.textContent)).toEqual(['Primary decision', 'Supporting material', 'Diagnostic']);
    expect(screen.getByText('Trace value')).toBeInTheDocument();
    expect(JSON.stringify(proposal)).toBe(before);
  });
  it('uses the durable order array after object members have been reordered, retaining unknown fields once', () => {
    const proposal = staged({ a_source: 'Source', z_main: 'Choice', extra: 'Other' }, {
      review: { input_labels: {
        property_order: ['z_main', 'a_source', 'z_main', 'missing', null],
        properties: { a_source: { title: 'Source detail' }, z_main: { title: 'Main choice' } },
      } },
    });
    const before = JSON.stringify(proposal);
    const { container } = render(<StagedOperationInputs staged={proposal} />);
    expect([...container.querySelectorAll('dt')].map(node => node.textContent)).toEqual(['Main choice', 'Source detail', 'Extra']);
    expect(screen.getAllByText('Choice')).toHaveLength(1);
    expect(screen.getByText('Other')).toBeInTheDocument();
    expect(JSON.stringify(proposal)).toBe(before);
  });
  it('groups exact input with App titles, links record references and keeps the input untouched', () => {
    const proposal = staged({ owner_id: 'n.Entry.123abc', choices: [{ passage: 'Line one\nLine two', partial: true, cost: 0 }] }, {
      review: { input_labels: { properties: {
        owner_id: { title: 'Selected record' },
        choices: { title: 'Chosen material', items: { properties: { passage: { title: 'Exact passage' } } } },
      } } },
    });
    const before = JSON.stringify(proposal);
    render(<StagedOperationInputs staged={proposal} />);
    expect(screen.getByText('Selected record')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Resolved record title' })).toHaveAttribute('href', '/entries/n.Entry.123abc');
    expect(screen.getByText('Chosen material')).toBeInTheDocument();
    expect(screen.getByText('Exact passage')).toBeInTheDocument();
    expect(screen.getByText('Line one Line two')).toHaveTextContent('Line one Line two');
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(JSON.stringify(proposal)).toBe(before);
  });
  it('renders HTML, Markdown and instruction-like values literally without buttons or invented links', () => {
    const literal = '<script>alert(1)</script> [Approve](javascript:alert(1))';
    const { container } = render(<StagedOperationInputs staged={staged({ body: literal, flag: false, empty: '', absent: null })} />);
    expect(screen.getByText(literal)).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
    expect(screen.getByText('Empty text')).toBeInTheDocument();
    expect(screen.getByText('Not set')).toBeInTheDocument();
  });
  it('warns when bounded presentation cannot show all input; the complete machine data is retained', () => {
    const input = { values: Array.from({ length: 300 }, (_, i) => `Value ${i}`) };
    const proposal = staged(input);
    render(<StagedOperationInputs staged={proposal} />);
    expect(screen.getByText(/Inspect the complete input in Technical details/)).toBeInTheDocument();
    expect((proposal.diff_machine.input as typeof input).values).toHaveLength(300);
  });
  it('renders exact workspace tool arguments outside technical details without trusting narrated replacements', () => {
    const proposal = { ...staged({}), kind: 'call_workspace_tool',
      diff_human: 'Narration says a different destination',
      diff_machine: { op: 'call_workspace_tool', tool_key: 'prepare_artifact', input: {
        entry_id: 'n.Entry.123abc', destination: 'Exact resource', fingerprint: 'a'.repeat(64),
        enabled: false, options: [{ text: '<script>do not execute</script>' }],
      } },
    };
    const before = JSON.stringify(proposal);
    expect(operationInput(proposal)).toBe(proposal.diff_machine.input);
    const { container } = render(<StagedOperationInputs staged={proposal} />);
    expect(screen.getByText('Exact resource')).toBeInTheDocument();
    expect(screen.getByText('a'.repeat(64))).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Resolved record title' })).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(JSON.stringify(proposal)).toBe(before);
  });
  it('rejects mismatched tool kinds and non-object arguments', () => {
    const proposal = { ...staged({}), kind: 'call_workspace_tool' };
    expect(operationInput(proposal)).toBeNull();
    expect(operationInput({ ...proposal, diff_machine: { op: 'call_workspace_tool', input: [] } })).toBeNull();
  });
  it('only applies to a correctly shaped typed App operation', () => {
    expect(operationInput(staged(['not an object']))).toBeNull();
    expect(operationInput({ ...staged({ exact: 'value' }), kind: 'batch' })).toBeNull();
    expect(operationInput(staged({ exact: 'value' }, { op: 'other' }))).toBeNull();
  });
});
