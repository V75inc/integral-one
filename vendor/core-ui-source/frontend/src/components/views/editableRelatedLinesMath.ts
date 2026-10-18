/**
 * Unit helpers for editable_related_lines rollup math (extracted for tests).
 */

export function computeLineAmount(
  fields: Record<string, unknown>,
  quantityField?: string,
  rateField?: string,
  amountField?: string
): number {
  if (quantityField && rateField) {
    return (Number(fields[quantityField]) || 0) * (Number(fields[rateField]) || 0);
  }
  if (amountField) {
    const explicit = Number(fields[amountField]);
    if (Number.isFinite(explicit)) return explicit;
  }
  return 0;
}

export function computeSubtotal(
  lines: Array<{ fields: Record<string, unknown> }>,
  quantityField?: string,
  rateField?: string,
  amountField?: string
): number {
  return lines.reduce(
    (s, line) => s + computeLineAmount(line.fields, quantityField, rateField, amountField),
    0
  );
}

export type DiscountMode = 'percent' | 'amount';

export function computeDiscountedTotal(
  subtotal: number,
  opts: {
    mode?: DiscountMode | string | null;
    percent?: number | null;
    amount?: number | null;
  }
): { discount: number; total: number } {
  const mode = opts.mode === 'amount' ? 'amount' : 'percent';
  let discount = 0;
  if (mode === 'percent') {
    const pct = Number(opts.percent) || 0;
    discount = (subtotal * pct) / 100;
  } else {
    discount = Number(opts.amount) || 0;
  }
  if (discount < 0) discount = 0;
  if (discount > subtotal) discount = subtotal;
  return { discount, total: Math.max(0, subtotal - discount) };
}

/** Round money to cents (half-up via banker's-unfriendly but UI-stable). */
export function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Tax on one line amount. ``ratePercent`` is 14 for 14% VAT. */
export function computeLineTax(
  gross: number,
  ratePercent: number,
  inclusive: boolean
): number {
  const amount = Number(gross) || 0;
  const rate = (Number(ratePercent) || 0) / 100;
  if (!(amount > 0) || !(rate > 0)) return 0;
  if (inclusive) {
    return roundMoney((amount * rate) / (1 + rate));
  }
  return roundMoney(amount * rate);
}

/** Sum of per-line tax for a draft grid. */
export function computeTaxTotal(
  lines: Array<{ fields: Record<string, unknown> }>,
  opts: {
    quantityField?: string;
    rateField?: string;
    amountField?: string;
    taxColumn: string;
    ratePercentByCodeId: Record<string, number>;
    inclusive: boolean;
  }
): number {
  const col = String(opts.taxColumn || '').trim();
  if (!col) return 0;
  return roundMoney(
    lines.reduce((sum, line) => {
      const gross = computeLineAmount(
        line.fields,
        opts.quantityField,
        opts.rateField,
        opts.amountField
      );
      const codeId = String(line.fields[col] || '').trim();
      const ratePercent = Number(opts.ratePercentByCodeId[codeId]) || 0;
      return sum + computeLineTax(gross, ratePercent, opts.inclusive);
    }, 0)
  );
}

/**
 * Keep payment applications intact when the document total changes.
 * applied = previousTotal − previousBalance; newBalance = max(0, newTotal − applied).
 * When prior fields are missing, treat as unpaid (balance = newTotal).
 */
export function computeOpenBalance(
  newTotal: number,
  opts: {
    previousTotal?: number | null;
    previousBalance?: number | null;
  } = {}
): number {
  const total = roundMoney(newTotal);
  const prevTotal = Number(opts.previousTotal);
  const prevBalance = Number(opts.previousBalance);
  if (!Number.isFinite(prevTotal) || !Number.isFinite(prevBalance)) {
    return total;
  }
  const applied = roundMoney(Math.max(0, prevTotal - prevBalance));
  return roundMoney(Math.max(0, total - applied));
}
