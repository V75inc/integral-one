/** Product branding — single source of truth for user-facing name and hero copy.
 *
 *  Voice: editorial, grounded, concept-forward (per docs/product/CONCEPT.md v5). Integral
 *  is positioned as the "AI-native knowledge platform" — copy should reflect
 *  that, not generic productivity-tool language. */

import { PRODUCT_BRAND } from './host/branding';

export const PRODUCT_NAME = PRODUCT_BRAND.accessibleName;
export const PRODUCT_WORDMARK = PRODUCT_BRAND.name;
export const PRODUCT_EDITION = PRODUCT_BRAND.edition;

/** Login hero — returning user. Continuity for all three audiences:
 *  you, your team, and your AIs. Warm, plainspoken. */
export const LOGIN_TAGLINE =
  'Pick up with where you, your team or your agents left off';

export const LOGIN_FOOTER = "Your AI-native 'get-it-done' platform";

/** Signup hero — concrete benefit-led, split for a balanced two-line title. */
export const SIGNUP_HEADLINE = [
  'All your work',
  'and your AIs in one place.',
] as const;

/** Subcopy keeps "AI-queryable" as Integral's distinct phrase — concrete
 *  verbs (builds, decides, tracks) anchor what gets captured. */
export const SIGNUP_SUBCOPY =
  'Your AI-queryable workspace for everything your team builds, decides, and tracks.';

export const SIGNUP_FOOTER = 'Your AI-native knowledge platform.';
