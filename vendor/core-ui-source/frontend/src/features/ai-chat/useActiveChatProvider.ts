import { IntegralNativeProvider } from './providers/IntegralNativeProvider';
import type { ChatProvider } from './providers/types';

/** Integral AI is built in; environment and saved preferences cannot disable it. */
export function useActiveChatProvider(): ChatProvider {
  return IntegralNativeProvider;
}
