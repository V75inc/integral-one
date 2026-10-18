/**
 * useMentionAutocomplete — @-trigger autocomplete for textareas / inputs.
 */
import type { User } from '../types';
import {
  slugForTagToken,
  useTriggerAutocomplete,
} from './useTriggerAutocomplete';

export interface MentionAutocompleteState {
  active: boolean;
  query: string;
  triggerIndex: number;
  caretIndex: number;
}

export interface UseMentionAutocompleteOptions {
  value: string;
  onChange: (next: string) => void;
  hostRef: React.RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
}

export interface UseMentionAutocompleteResult {
  state: MentionAutocompleteState;
  onCaretChange: () => void;
  handleKeyDown: (
    e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>,
    handlers: {
      onArrowDown?: () => void;
      onArrowUp?: () => void;
      onEnter?: () => void;
      onTab?: () => void;
    },
  ) => boolean;
  replaceWithMention: (user: { display_name: string }) => void;
  dismiss: () => void;
}

export function useMentionAutocomplete({
  value,
  onChange,
  hostRef,
}: UseMentionAutocompleteOptions): UseMentionAutocompleteResult {
  const base = useTriggerAutocomplete<{ display_name: string }>({
    trigger: '@',
    value,
    onChange,
    hostRef,
    buildToken: (user: { display_name: string }) =>
      slugForTagToken(user.display_name),
  });

  return {
    state: base.state,
    onCaretChange: base.onCaretChange,
    handleKeyDown: base.handleKeyDown,
    replaceWithMention: base.replaceWithSelection,
    dismiss: base.dismiss,
  };
}

export type MentionUser = Pick<User, 'id' | 'display_name' | 'email'>;
