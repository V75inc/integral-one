import { describe, expect, it } from 'vitest';

import type { OperationalModelFieldSpec } from '../../../types';
import {
  evaluateComputedExpression,
  projectComputedValues,
  type ComputedAst,
} from '../computedExpression';
import cases from './computed_expression_cases.json';

const shared = cases as {
  cases: Array<{
    name: string;
    ast: ComputedAst;
    inputs: Record<string, unknown>;
    result: unknown;
  }>;
  calculator: {
    inputs: Record<string, unknown>;
    results: Record<string, number>;
    fields: OperationalModelFieldSpec[];
  };
};

describe('computed expressions', () => {
  it('matches the shared fixture for each expression', () => {
    for (const item of shared.cases) {
      expect(evaluateComputedExpression(item.ast, item.inputs)).toBe(item.result);
    }
  });

  it('projects the retail markup calculator as the inputs change', () => {
    const projected = projectComputedValues(
      shared.calculator.fields,
      shared.calculator.inputs,
    );
    expect(projected.markup_amount).toBe(shared.calculator.results.markup_amount);
    expect(projected.selling_price).toBe(shared.calculator.results.selling_price);
    expect(projected.discount_amount).toBe(shared.calculator.results.discount_amount);
    expect(projected.final_selling_price).toBe(
      shared.calculator.results.final_selling_price,
    );
    expect(projected.profit_amount).toBe(shared.calculator.results.profit_amount);
  });
});
