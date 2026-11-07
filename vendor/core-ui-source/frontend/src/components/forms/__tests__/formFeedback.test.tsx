import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  FieldProblem,
  focusFirstProblem,
  problemsFromApiError,
  summarizeProblems,
} from '../formFeedback';

afterEach(cleanup);

describe('summarizeProblems', () => {
  it('names the one field and what is wrong', () => {
    expect(summarizeProblems({ base_salary: 'Required' }, { base_salary: 'Base salary' })).toBe(
      'Base salary: Required'
    );
  });

  it('counts and names several fields', () => {
    expect(
      summarizeProblems(
        { a: 'Required', b: 'Required', c: 'Required' },
        { a: 'Salary', b: 'Currency', c: 'Date' }
      )
    ).toBe('3 things need attention: Salary, Currency, Date');
  });
});

describe('problemsFromApiError', () => {
  const keys = ['salary', 'currency'];
  const err = (details: unknown) => ({ response: { data: { details } } });

  it('reads a list of field messages and ignores unknown fields', () => {
    const found = problemsFromApiError(
      err([
        { field: 'custom_fields.salary', message: 'Must be a number' },
        { field: 'other', message: 'ignored' },
      ]),
      keys
    );
    expect(found).toEqual({ salary: 'Must be a number' });
  });

  it('reads missing_fields and field_errors', () => {
    expect(
      problemsFromApiError(err({ missing_fields: [{ key: 'currency' }] }), keys)
    ).toEqual({ currency: 'Required' });
    expect(problemsFromApiError(err({ field_errors: { salary: 'Too low' } }), keys)).toEqual({
      salary: 'Too low',
    });
  });

  it('returns nothing when the error names no fields', () => {
    expect(problemsFromApiError(new Error('boom'), keys)).toEqual({});
  });
});

describe('FieldProblem', () => {
  it('highlights, explains, and keeps the same input element', () => {
    const { rerender } = render(
      <FieldProblem fieldKey="salary">
        <input aria-label="Salary" />
      </FieldProblem>
    );
    const input = screen.getByLabelText('Salary');
    expect(document.querySelector('[data-field-problem]')).toBeNull();

    rerender(
      <FieldProblem fieldKey="salary" message="Required">
        <input aria-label="Salary" />
      </FieldProblem>
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
    expect(document.querySelector('[data-field-problem="salary"]')).not.toBeNull();
    // Highlighting must not remount the field or the person loses what they typed.
    expect(screen.getByLabelText('Salary')).toBe(input);
  });

  it('puts the cursor in the first highlighted field', () => {
    render(
      <>
        <FieldProblem fieldKey="a">
          <input aria-label="A" />
        </FieldProblem>
        <FieldProblem fieldKey="b" message="Required">
          <input aria-label="B" />
        </FieldProblem>
      </>
    );
    Element.prototype.scrollIntoView = () => {};
    focusFirstProblem();
    expect(screen.getByLabelText('B')).toHaveFocus();
  });
});
