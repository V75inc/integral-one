// Match SendMessageRequest.text: Python counts Unicode code points, not UTF-16
// code units. Keep pasted and dictated drafts intact so users can edit them.
export const MAX_CHAT_MESSAGE_CHARACTERS = 8_000;

export function chatMessageTooLong(text: string): boolean {
  return Array.from(text).length > MAX_CHAT_MESSAGE_CHARACTERS;
}

export const CHAT_MESSAGE_LENGTH_HINT =
  'Messages can contain up to 8,000 characters. Shorten this draft or attach the text as a file.';
