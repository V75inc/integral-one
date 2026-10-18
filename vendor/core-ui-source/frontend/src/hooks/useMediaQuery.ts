import { useEffect, useState } from 'react';

/** Tailwind `md` breakpoint (px). */
export const MD_MIN_WIDTH = 768;

export function useMatchesMedia(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export function useIsMdUp(): boolean {
  return useMatchesMedia(`(min-width: ${MD_MIN_WIDTH}px)`);
}
