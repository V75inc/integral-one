import { describe, it, expect } from 'vitest';
import {
  passwordStrength,
  validateLogin,
  validateSignup,
} from '../authValidation';

describe('validateLogin', () => {
  it('flags missing email + password', () => {
    const errs = validateLogin({ email: '', password: '' });
    expect(errs.email).toBe('Email is required.');
    expect(errs.password).toBe('Password is required.');
  });

  it('flags invalid email shape', () => {
    const errs = validateLogin({ email: 'bademail', password: 'whatever' });
    expect(errs.email).toBe('Enter a valid email address.');
  });

  it('passes with valid input', () => {
    const errs = validateLogin({ email: 'a@b.co', password: 'whatever' });
    expect(errs).toEqual({});
  });
});

describe('validateSignup', () => {
  it('rejects short passwords with the length message', () => {
    const errs = validateSignup({
      displayName: 'Eldon',
      email: 'a@b.co',
      password: 'abc',
    });
    expect(errs.password).toMatch(/at least 12/);
  });

  it('rejects weak common passwords', () => {
    const errs = validateSignup({
      displayName: 'Eldon',
      email: 'a@b.co',
      password: 'password',
    });
    expect(errs.password).toBeTruthy();
  });

  it('accepts a strong mixed-class password', () => {
    const errs = validateSignup({
      displayName: 'Eldon',
      email: 'a@b.co',
      password: 'Strong-Pw-2026',
    });
    expect(errs).toEqual({});
  });

  it('rejects missing display name', () => {
    const errs = validateSignup({
      displayName: '   ',
      email: 'a@b.co',
      password: 'Strong-Pw-2026',
    });
    expect(errs.displayName).toBe('Display name is required.');
  });
});

describe('passwordStrength', () => {
  it('scores 0 for empty', () => {
    expect(passwordStrength('')).toBe(0);
  });

  it('penalizes the literal "password"', () => {
    expect(passwordStrength('password')).toBeLessThanOrEqual(1);
  });

  it('penalizes 123456 sequences', () => {
    expect(passwordStrength('12345678')).toBeLessThanOrEqual(1);
  });

  it('scores higher with class diversity', () => {
    expect(passwordStrength('Strong-Pw-2026')).toBeGreaterThanOrEqual(3);
  });
});
