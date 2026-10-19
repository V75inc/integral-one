/**
 * ToolMentionTextarea — @-trigger autocomplete for MCP tool names.
 */
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { useTriggerAutocomplete } from '../../hooks/useTriggerAutocomplete';
import type { ToolCatalogueEntry } from '../../api/skills';
import { getMentionPopoverAnchor } from '../mentions/mentionPopoverAnchor';
import { Surface, Text } from '../../ui';

interface Props
  extends Omit<
    React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    'value' | 'onChange'
  > {
  value: string;
  onChange: (next: string) => void;
  tools: ToolCatalogueEntry[];
  onToolSelect?: (tool: ToolCatalogueEntry) => void;
}

export const ToolMentionTextarea = forwardRef<HTMLTextAreaElement, Props>(
  function ToolMentionTextarea(
    { value, onChange, tools, onToolSelect, onKeyDown, onKeyUp, onClick, className, ...rest },
    ref,
  ) {
    const localRef = useRef<HTMLTextAreaElement | null>(null);
    useImperativeHandle(ref, () => localRef.current as HTMLTextAreaElement, []);

    const autocomplete = useTriggerAutocomplete<ToolCatalogueEntry>({
      trigger: '@',
      value,
      onChange,
      hostRef: localRef,
      buildToken: (item: ToolCatalogueEntry) => `\`${item.name}\``,
    });

    const [highlight, setHighlight] = useState(0);

    const candidates = useMemo(() => {
      if (!autocomplete.state.active) return [];
      const q = autocomplete.state.query.toLowerCase();
      return tools.filter(
        t =>
          t.name.toLowerCase().includes(q) ||
          t.friendly_label.toLowerCase().includes(q),
      );
    }, [autocomplete.state.active, autocomplete.state.query, tools]);

    const moveHighlight = useCallback(
      (delta: number) => {
        setHighlight(i => {
          if (candidates.length === 0) return 0;
          const n = candidates.length;
          return ((i + delta) % n + n) % n;
        });
      },
      [candidates.length],
    );

    const selectTool = useCallback(
      (tool: ToolCatalogueEntry) => {
        autocomplete.replaceWithSelection(tool);
        onToolSelect?.(tool);
        setHighlight(0);
      },
      [autocomplete, onToolSelect],
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const handled = autocomplete.handleKeyDown(e, {
          onArrowDown: () => moveHighlight(1),
          onArrowUp: () => moveHighlight(-1),
          onEnter: () => {
            const tool = candidates[highlight];
            if (tool) selectTool(tool);
          },
          onTab: () => {
            const tool = candidates[highlight];
            if (tool) selectTool(tool);
          },
        });
        if (handled) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        onKeyDown?.(e);
      },
      [autocomplete, candidates, highlight, moveHighlight, onKeyDown, selectTool],
    );

    const anchor = useMemo(() => {
      if (!autocomplete.state.active || !localRef.current) return null;
      return getMentionPopoverAnchor(
        localRef.current,
        autocomplete.state.caretIndex,
      );
    }, [autocomplete.state.active, autocomplete.state.caretIndex]);

    return (
      <>
        <textarea
          ref={localRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onKeyUp={e => {
            autocomplete.onCaretChange();
            onKeyUp?.(e);
          }}
          onClick={e => {
            autocomplete.onCaretChange();
            onClick?.(e);
          }}
          className={className}
          {...rest}
        />
        {autocomplete.state.active && anchor
          ? createPortal(
              // Positioning owns the raw div + inline style (Surface has no
              // `style` prop — the anchor coords are computed px, not
              // expressible as Tailwind classes); Surface nests inside for
              // the visual chrome.
              <div
                className="fixed z-popover"
                style={{
                  top: anchor.top,
                  left: anchor.left,
                  transform: anchor.transform,
                }}
              >
                <Surface
                  tone="panel"
                  border="default"
                  radius="input"
                  elevation="pop"
                  className="min-w-[16rem] max-w-sm"
                >
                  <ul className="max-h-56 overflow-y-auto py-1">
                    {candidates.length === 0 ? (
                      <Text as="li" variant="body" tone="muted" className="px-3 py-2">
                        No matching tools
                      </Text>
                    ) : (
                      candidates.map((tool, idx) => (
                        <li key={tool.name}>
                          <button
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm"
                            // Surface can't carry onMouseDown (static prop
                            // API, no rest-prop forwarding), and `--panel-2`
                            // is the correct token for this row-hover pattern
                            // (matches MentionPopover/CommandPalette) — state-
                            // driven inline background instead of a raw
                            // Tailwind literal keeps hover and keyboard
                            // highlight as a single source of truth too.
                            style={
                              idx === highlight
                                ? { backgroundColor: 'var(--panel-2)' }
                                : undefined
                            }
                            onMouseEnter={() => setHighlight(idx)}
                            onMouseDown={e => {
                              e.preventDefault();
                              selectTool(tool);
                            }}
                          >
                            <div className="font-medium">{tool.friendly_label}</div>
                            <Text as="div" variant="meta" tone="muted">
                              {tool.name}
                            </Text>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </Surface>
              </div>,
              document.body,
            )
          : null}
      </>
    );
  },
);
