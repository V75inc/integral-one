import { Extension } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import { tracksApi } from '../../../api/tracks';
import { slugForTagToken } from '../../../hooks/useTriggerAutocomplete';
import {
  WikiMentionList,
  type WikiMentionItem,
  type WikiMentionListRef,
} from './WikiMentionList';

function positionMentionPopover(
  el: HTMLElement,
  clientRect?: (() => DOMRect | null) | null
) {
  const rect = clientRect?.();
  if (!rect) return;
  el.style.left = `${Math.round(rect.left)}px`;
  el.style.top = `${Math.round(rect.bottom + 4)}px`;
}

export function createWikiAtMentionExtension(trackId?: string) {
  return Extension.create({
    name: 'wikiAtMention',

    addOptions() {
      return {
        trackId: trackId || '',
      };
    },

    addProseMirrorPlugins() {
      const trackId = this.options.trackId;

      return [
        Suggestion<WikiMentionItem, WikiMentionItem>({
          editor: this.editor,
          char: '@',
          allowSpaces: false,
          pluginKey: new PluginKey('wikiAtMention'),
          items: async ({ query }) => {
            if (!trackId) return [];
            try {
              const { users } = await tracksApi.getMentionCandidates(trackId, query, 12);
              return users.map(u => ({
                id: u.id,
                label: slugForTagToken(u.display_name || u.email || u.id),
                displayName: u.display_name || u.email || u.id,
                email: u.email,
                avatarAttachmentId: u.avatar_attachment_id,
              }));
            } catch {
              return [];
            }
          },
          command: ({ editor, range, props }) => {
            editor
              .chain()
              .focus()
              .insertContentAt(range, `@${props.label} `)
              .run();
          },
          render: () => {
            let component: ReactRenderer<WikiMentionListRef> | null = null;
            let root: HTMLDivElement | null = null;

            return {
              onStart: (props: SuggestionProps<WikiMentionItem, WikiMentionItem>) => {
                root = document.createElement('div');
                root.setAttribute('data-wiki-mention-popover', '');
                root.style.position = 'fixed';
                root.style.zIndex = '1200';
                document.body.appendChild(root);

                component = new ReactRenderer(WikiMentionList, {
                  props,
                  editor: props.editor,
                });
                root.appendChild(component.element);
                positionMentionPopover(root, props.clientRect);
              },
              onUpdate(props: SuggestionProps<WikiMentionItem, WikiMentionItem>) {
                component?.updateProps(props);
                if (root) positionMentionPopover(root, props.clientRect);
              },
              onKeyDown(props) {
                if (props.event.key === 'Escape') {
                  return true;
                }
                return component?.ref?.onKeyDown(props) ?? false;
              },
              onExit() {
                component?.destroy();
                root?.remove();
                component = null;
                root = null;
              },
            };
          },
        }),
      ];
    },
  });
}
