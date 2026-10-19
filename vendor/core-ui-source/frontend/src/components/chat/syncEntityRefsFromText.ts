import type { ChatEntityRef } from '../../types/chatEntityRefs';
import { refAppearsInText } from './chatEntityTokens';

/** Drop refs whose token no longer appears in the message body. */
export function syncEntityRefsFromText(
  text: string,
  refs: ChatEntityRef[],
): ChatEntityRef[] {
  if (!refs.length) return refs;
  return refs.filter(ref => refAppearsInText(text, ref));
}
