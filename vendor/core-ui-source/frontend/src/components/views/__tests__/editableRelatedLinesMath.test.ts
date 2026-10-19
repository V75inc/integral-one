import { describe, expect, it } from 'vitest';
import {
  computeDiscountedTotal,
  computeLineAmount,
  computeLineTax,
  computeOpenBalance,
  computeSubtotal,
  computeTaxTotal,
} from '../editableRelatedLinesMath';

describe('editableRelatedLinesMath', () => {
  it('computes qty * rate', () => {
    expect(
      computeLineAmount(
        { quantity: 2, unit_price: 50 },
        'quantity',
        'unit_price',
        'line_amount'
      )
    ).toBe(100);
  });

  it('sums lines for parent total', () => {
    expect(
      computeSubtotal(
        [
          { fields: { quantity: 1, unit_price: 10 } },
          { fields: { quantity: 3, unit_price: 20 } },
        ],
        'quantity',
        'unit_price',
        'line_amount'
      )
    ).toBe(70);
  });

  it('applies percent and amount discounts', () => {
    expect(computeDiscountedTotal(100, { mode: 'percent', percent: 10 })).toEqual({
      discount: 10,
      total: 90,
    });
    expect(computeDiscountedTotal(100, { mode: 'amount', amount: 25 })).toEqual({
      discount: 25,
      total: 75,
    });
  });

  it('computes inclusive and exclusive line tax', () => {
    expect(computeLineTax(100, 14, true)).toBe(12.28);
    expect(computeLineTax(100, 14, false)).toBe(14);
    expect(computeLineTax(0, 14, true)).toBe(0);
  });

  it('sums tax across lines from tax code rates', () => {
    expect(
      computeTaxTotal(
        [
          { fields: { quantity: 1, unit_price: 100, tax_code: 'vat' } },
          { fields: { quantity: 2, unit_price: 50, tax_code: 'zr' } },
        ],
        {
          quantityField: 'quantity',
          rateField: 'unit_price',
          amountField: 'line_amount',
          taxColumn: 'tax_code',
          ratePercentByCodeId: { vat: 14, zr: 0 },
          inclusive: true,
        }
      )
    ).toBe(12.28);
  });

  it('preserves applied payments when document total changes', () => {
    // 2400 total, 1022 paid → balance 1378; total rises to 2500 → balance 1478
    expect(
      computeOpenBalance(2500, { previousTotal: 2400, previousBalance: 1378 }),
    ).toBe(1478);
    // Fully paid stays paid when total unchanged
    expect(
      computeOpenBalance(100, { previousTotal: 100, previousBalance: 0 }),
    ).toBe(0);
    // New / unpaid document — balance equals total
    expect(computeOpenBalance(2400, {})).toBe(2400);
  });
});
