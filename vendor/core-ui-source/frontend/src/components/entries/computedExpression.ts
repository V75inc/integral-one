import type { OperationalModelFieldSpec } from '../../types';

/** Compiled expression produced by the backend computed-field parser. */
export type ComputedAst =
  | { op: 'num'; value: string }
  | { op: 'str'; value: string }
  | { op: 'field'; key: string }
  | { op: 'neg'; arg: ComputedAst }
  | { op: 'add' | 'sub' | 'mul' | 'div'; left: ComputedAst; right: ComputedAst }
  | { op: 'concat'; args: ComputedAst[] };

const SCALE = 1_000_000n;

function divRound(numer: bigint, denom: bigint): bigint {
  if (denom === 0n) return 0n;
  const negative = numer < 0n !== denom < 0n;
  const n = numer < 0n ? -numer : numer;
  const d = denom < 0n ? -denom : denom;
  const quotient = n / d;
  const remainder = n % d;
  const rounded = remainder * 2n >= d ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

function decimalToScaled(text: string): bigint | null {
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const negative = text.startsWith('-');
  const body = negative ? text.slice(1) : text;
  const [whole, frac = ''] = body.split('.');
  const digits = `${frac}0000000`.slice(0, 7);
  let scaled = BigInt(whole) * SCALE + BigInt(digits.slice(0, 6));
  if (digits[6] >= '5') scaled += 1n;
  return negative ? -scaled : scaled;
}

function toScaled(value: unknown): bigint | null {
  if (value == null || typeof value === 'boolean') return null;
  const text =
    typeof value === 'number'
      ? String(value)
      : typeof value === 'string'
        ? value.trim()
        : '';
  if (!text) return null;
  return decimalToScaled(text);
}

function jsonNumber(scaled: bigint): number {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const whole = abs / SCALE;
  const frac = abs % SCALE;
  const sign = negative ? '-' : '';
  if (frac === 0n) return Number(`${sign}${whole}`);
  const text = frac.toString().padStart(6, '0').replace(/0+$/, '');
  return Number(`${sign}${whole}.${text}`);
}

function isAst(value: unknown): value is ComputedAst {
  return Boolean(value) && typeof value === 'object' && 'op' in (value as object);
}

/** Evaluate one compiled expression. Missing numbers and division by zero are null. */
export function evaluateComputedExpression(
  ast: ComputedAst,
  values: Record<string, unknown>,
): unknown {
  if (ast.op === 'num') return jsonNumber(toScaled(ast.value) ?? 0n);
  if (ast.op === 'str') return ast.value;
  if (ast.op === 'field') return values[ast.key];
  if (ast.op === 'neg') {
    const scaled = toScaled(evaluateComputedExpression(ast.arg, values));
    return scaled == null ? null : jsonNumber(-scaled);
  }
  if (ast.op === 'add' || ast.op === 'sub' || ast.op === 'mul' || ast.op === 'div') {
    const left = toScaled(evaluateComputedExpression(ast.left, values));
    const right = toScaled(evaluateComputedExpression(ast.right, values));
    if (left == null || right == null) return null;
    if (ast.op === 'add') return jsonNumber(left + right);
    if (ast.op === 'sub') return jsonNumber(left - right);
    if (ast.op === 'mul') return jsonNumber(divRound(left * right, SCALE));
    if (right === 0n) return null;
    return jsonNumber(divRound(left * SCALE, right));
  }
  if (ast.op === 'concat') {
    const parts: string[] = [];
    for (const arg of ast.args) {
      const part = evaluateComputedExpression(arg, values);
      if (part == null) return null;
      parts.push(String(part));
    }
    return parts.join('');
  }
  return null;
}

function fieldRefs(ast: ComputedAst): string[] {
  if (ast.op === 'field') return [ast.key];
  if (ast.op === 'neg') return fieldRefs(ast.arg);
  if (ast.op === 'add' || ast.op === 'sub' || ast.op === 'mul' || ast.op === 'div') {
    return [...fieldRefs(ast.left), ...fieldRefs(ast.right)];
  }
  if (ast.op === 'concat') return ast.args.flatMap(fieldRefs);
  return [];
}

function expressionAst(field: OperationalModelFieldSpec): ComputedAst | null {
  const ast = field.expression?.ast;
  return isAst(ast) ? ast : null;
}

/**
 * Copy values and fill computed fields from their stored expressions.
 * A cycle leaves those keys null.
 */
export function projectComputedValues(
  fields: OperationalModelFieldSpec[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...values };
  const computed = fields.filter(field => field.type === 'computed');
  if (!computed.length) return out;
  const computedKeys = new Set(computed.map(field => field.key));
  const deps = new Map<string, string[]>();
  for (const field of computed) {
    delete out[field.key];
    const ast = expressionAst(field);
    deps.set(
      field.key,
      ast ? fieldRefs(ast).filter(key => computedKeys.has(key)) : [],
    );
  }
  const remaining = new Map([...deps].map(([key, refs]) => [key, [...refs]]));
  const ordered: string[] = [];
  const ready = [...remaining].filter(([, refs]) => refs.length === 0).map(([key]) => key);
  while (ready.length) {
    const key = ready.pop() as string;
    ordered.push(key);
    for (const [other, refs] of remaining) {
      const index = refs.indexOf(key);
      if (index >= 0) {
        refs.splice(index, 1);
        if (!refs.length && !ordered.includes(other) && !ready.includes(other)) {
          ready.push(other);
        }
      }
    }
  }
  const byKey = new Map(fields.map(field => [field.key, field]));
  if (ordered.length !== remaining.size) {
    for (const key of remaining.keys()) out[key] = null;
    return out;
  }
  for (const key of ordered) {
    const ast = expressionAst(byKey.get(key) as OperationalModelFieldSpec);
    out[key] = ast ? evaluateComputedExpression(ast, out) : null;
  }
  return out;
}
