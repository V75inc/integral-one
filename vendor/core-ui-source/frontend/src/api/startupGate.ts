/**
 * Let the content the user asked for reach the server first.
 *
 * A page load also mounts panels that are not the point of the page (chat history,
 * approvals and notification badges, voice and AI settings, pending staged changes).
 * On a single API worker they queue in front of the page's own data. For the first
 * ``STARTUP_WINDOW_MS`` after the app script loads, GETs to those endpoints wait for
 * the window to close; afterwards the gate is open and nothing is ever delayed again.
 * Nothing is dropped or reordered beyond that wait, and the endpoints are unchanged.
 */
export const STARTUP_WINDOW_MS = 2000;

const DEFERRABLE_GETS: RegExp[] = [
  /^\/chat\/threads(\?|$)/,
  /^\/approvals(\?|$)/,
  /^\/notifications(\?|$)/,
  /^\/agentive\/speech\/config(\?|$)/,
  /^\/users\/me\/ai-configuration(\?|$)/,
  /^\/agentive\/staging\/(pending|designs)(\?|$)/,
];

let opened = false;
let gate: Promise<void> | null = null;

function startupGate(): Promise<void> {
  if (opened) return Promise.resolve();
  if (!gate) {
    gate = new Promise<void>(resolve => {
      setTimeout(() => {
        opened = true;
        resolve();
      }, STARTUP_WINDOW_MS);
    });
  }
  return gate;
}

/** The gate starts counting when the module is first imported (page load). */
if (typeof window !== 'undefined') void startupGate();

export function isDeferrableStartupGet(method: string | undefined, url: string | undefined): boolean {
  if (opened) return false;
  if (String(method || 'get').toLowerCase() !== 'get') return false;
  const path = String(url || '').replace(/^https?:\/\/[^/]+/, '').replace(/^\/api(?=\/)/, '');
  return DEFERRABLE_GETS.some(re => re.test(path));
}

export function waitForStartupWindow(): Promise<void> {
  return startupGate();
}

/** Test hook. */
export function _resetStartupGateForTests(open: boolean): void {
  opened = open;
  gate = open ? Promise.resolve() : null;
}
