/**
 * Client-side auth form validation — single source of truth so login,
 * signup, password reset, and email verification all surface the same
 * inline feedback (B-AUTH-01, B-AUTH-03, B-AUTH-04 from V1 review).
 *
 * Strategy: return a per-field error map. Empty map = valid. The form
 * shows inline messages under each invalid field and never relies on
 * the native HTML5 popover or a toast alone.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const MIN_PASSWORD_LEN = 12;

export interface LoginValidationInput {
  email: string;
  password: string;
}

export interface SignupValidationInput {
  displayName: string;
  email: string;
  password: string;
}

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export function validateLogin(
  input: LoginValidationInput,
): FieldErrors<'email' | 'password' | 'form'> {
  const errs: FieldErrors<'email' | 'password' | 'form'> = {};
  if (!input.email.trim()) {
    errs.email = 'Email is required.';
  } else if (!EMAIL_RE.test(input.email.trim())) {
    errs.email = 'Enter a valid email address.';
  }
  if (!input.password) {
    errs.password = 'Password is required.';
  }
  return errs;
}

export function validateSignup(
  input: SignupValidationInput,
): FieldErrors<'displayName' | 'email' | 'password' | 'form'> {
  const errs: FieldErrors<'displayName' | 'email' | 'password' | 'form'> = {};
  if (!input.displayName.trim()) {
    errs.displayName = 'Display name is required.';
  }
  if (!input.email.trim()) {
    errs.email = 'Email is required.';
  } else if (!EMAIL_RE.test(input.email.trim())) {
    errs.email = 'Enter a valid email address.';
  }
  if (!input.password) {
    errs.password = 'Password is required.';
  } else if (input.password.length < MIN_PASSWORD_LEN) {
    errs.password = `Password must be at least ${MIN_PASSWORD_LEN} characters.`;
  } else if (passwordStrength(input.password) < 2) {
    errs.password =
      'Use a stronger password — mix upper, lower, numbers, or symbols.';
  }
  return errs;
}

/**
 * passwordStrength — 0..4 score based on character-class variety and
 * length. Cheap, no dependencies. Not a substitute for zxcvbn but
 * good enough to refuse "password" / "12345678" / "letmein".
 */
export function passwordStrength(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  const classes = [
    /[a-z]/u.test(pw),
    /[A-Z]/u.test(pw),
    /[0-9]/u.test(pw),
    /[^A-Za-z0-9]/u.test(pw),
  ].filter(Boolean).length;
  if (classes >= 2) score += 1;
  if (classes >= 3) score += 1;
  // Penalty for common weak patterns.
  const lower = pw.toLowerCase();
  if (
    lower === 'password' ||
    lower === 'qwerty' ||
    lower === 'letmein' ||
    /^(.)\1+$/u.test(pw) ||
    /^012345|^123456|^234567|^345678|^456789|^567890/u.test(pw)
  ) {
    score = Math.min(score, 1);
  }
  return Math.min(score, 4);
}

export const PASSWORD_STRENGTH_LABELS = [
  'Too weak',
  'Weak',
  'Fair',
  'Strong',
  'Excellent',
];

export const MIN_PASSWORD_LENGTH = MIN_PASSWORD_LEN;
