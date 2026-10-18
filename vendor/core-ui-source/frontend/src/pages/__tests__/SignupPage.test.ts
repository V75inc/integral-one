import { describe, expect, it } from 'vitest';
import { signupErrorMessage } from '../SignupPage';

describe('signupErrorMessage', () => {
  it('uses the structured Integral API message before legacy detail', () => {
    expect(
      signupErrorMessage({
        response: {
          data: {
            message: 'Validation failed for signup body',
            detail: 'legacy detail',
          },
        },
      })
    ).toBe('Validation failed for signup body');
  });

  it('retains a safe fallback for network failures', () => {
    expect(signupErrorMessage(new Error('offline'))).toBe(
      'Signup failed. Please try again.'
    );
  });
});
