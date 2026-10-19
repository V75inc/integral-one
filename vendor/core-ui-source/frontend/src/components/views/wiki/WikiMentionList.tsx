import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { SuggestionKeyDownProps } from '@tiptap/suggestion';
import { Avatar } from '../../ui/Avatar';

export interface WikiMentionItem {
  id: string;
  label: string;
  displayName: string;
  email?: string;
  avatarAttachmentId?: string;
}

export interface WikiMentionListProps {
  items: WikiMentionItem[];
  command: (item: WikiMentionItem) => void;
}

export interface WikiMentionListRef {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

export const WikiMentionList = forwardRef<WikiMentionListRef, WikiMentionListProps>(
  function WikiMentionList({ items, command }, ref) {
    const [selected, setSelected] = useState(0);

    useEffect(() => {
      setSelected(0);
    }, [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === 'ArrowUp') {
          setSelected(i => (i + items.length - 1) % Math.max(items.length, 1));
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelected(i => (i + 1) % Math.max(items.length, 1));
          return true;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          const item = items[selected];
          if (item) command(item);
          return true;
        }
        return false;
      },
    }));

    if (!items.length) {
      return (
        <div
          className="min-w-[12rem] rounded-[var(--radius-card)] border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-2 text-xs text-[var(--text-muted)] shadow-[var(--shadow-pop)]"
          role="listbox"
        >
          No matches
        </div>
      );
    }

    return (
      <div
        className="min-w-[14rem] max-w-xs max-h-56 overflow-y-auto rounded-[var(--radius-card)] border border-[var(--panel-border)] bg-[var(--panel)] py-1 shadow-[var(--shadow-pop)]"
        role="listbox"
      >
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={index === selected}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-sm transition-colors ${
              index === selected
                ? 'bg-[var(--panel-2)] text-[var(--text)]'
                : 'text-[var(--text-muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]'
            }`}
            onMouseEnter={() => setSelected(index)}
            onMouseDown={e => {
              e.preventDefault();
              command(item);
            }}
          >
            <Avatar
              name={item.displayName}
              size="xs"
              userId={item.id}
              attachmentId={item.avatarAttachmentId}
            />
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium">{item.displayName}</span>
              {item.email ? (
                <span className="block text-[10px] text-[var(--text-subtle)] truncate">
                  {item.email}
                </span>
              ) : null}
            </span>
          </button>
        ))}
      </div>
    );
  }
);
