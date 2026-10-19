import { useCallback, useEffect, useLayoutEffect, useId, useRef, useState } from 'react';
import { Text, Surface } from '../../../ui';
import { createPortal } from 'react-dom';
import { aiChatApi } from '../../../api/aiChat';

/** Compact single-line title; the full name remains available outside the scrolling rail. */
export function ConversationLabel({ title, threadId, lastActivity, createdAt, messageCount, working = false }: {
  title: string;
  threadId?: string;
  lastActivity?: string | null;
  createdAt?: string;
  messageCount?: number;
  working?: boolean;
}) {
  const tooltipId = useId();
  const labelRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [expandedTitle, setExpandedTitle] = useState<{ key: string; text: string } | null>(null);
  const titleKey = `${threadId || ''}:${title}`;
  const displayTitle = expandedTitle?.key === titleKey ? expandedTitle.text : title;
  const open = position !== null;
  const dismiss = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setPosition(null);
    setExpandedTitle(null);
  }, []);
  const keepOpen = () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  const hideSoon = () => { keepOpen(); hideTimer.current = setTimeout(dismiss, 120); };
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);
  useEffect(() => {
    // Legacy fallback labels were stored as the first 60 characters plus an
    // ellipsis. Recover their complete text through the authorized thread API
    // only while the card is open; never rewrite the conversation's name.
    if (!open || !threadId || Array.from(title).length !== 61 || !title.endsWith('…')) return;
    let cancelled = false;
    void aiChatApi.getThread(threadId).then(thread => {
      if (cancelled || thread.title !== title) return;
      const first = thread.messages.find(message => message.role === 'user');
      const text = (first?.parts || []).filter(part => part.type === 'text')
        .map(part => String(part.text || '')).join(' ').trim().split(/\s+/).join(' ');
      if (Array.from(text).length > 60 && `${Array.from(text).slice(0, 60).join('')}…` === title) {
        setExpandedTitle({ key: titleKey, text });
      }
    }).catch(() => { /* A failed current-authority read never reveals cached text. */ });
    return () => { cancelled = true; };
  }, [open, threadId, title, titleKey]);
  const reveal = useCallback((element: HTMLElement) => {
    window.dispatchEvent(new CustomEvent('integral:conversation-title-reveal', { detail: tooltipId }));
    const rect = element.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(rect.right + 8, window.innerWidth - Math.min(560, window.innerWidth - 16) - 8)),
      top: Math.max(8, Math.min(rect.top, window.innerHeight - 80)),
    });
  }, [tooltipId]);
  useLayoutEffect(() => {
    if (!position || !cardRef.current) return;
    const height = cardRef.current.getBoundingClientRect().height;
    const top = Math.max(8, Math.min(position.top, window.innerHeight - height - 8));
    if (top !== position.top) setPosition({ ...position, top });
  }, [position, displayTitle]);
  useEffect(() => {
    const label = labelRef.current;
    const trigger = label?.closest('button');
    if (!label || !trigger) return;
    const focus = () => reveal(label);
    const blur = dismiss;
    const scroll = (e: Event) => {
      if (e.target instanceof Node && cardRef.current?.contains(e.target)) return;
      blur();
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') blur(); };
    const otherPreview = (e: Event) => { if ((e as CustomEvent<string>).detail !== tooltipId) blur(); };
    window.addEventListener('integral:conversation-title-reveal', otherPreview);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', blur);
    window.addEventListener('keydown', key);
    trigger.addEventListener('focus', focus);
    trigger.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('integral:conversation-title-reveal', otherPreview);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', blur);
      window.removeEventListener('keydown', key);
      trigger.removeEventListener('focus', focus);
      trigger.removeEventListener('blur', blur);
    };
  }, [tooltipId, reveal, dismiss]);
  return (
    <span ref={labelRef} className="min-w-0 flex-1"
      onMouseEnter={e => { keepOpen(); reveal(e.currentTarget); }} onMouseLeave={e => { if (e.relatedTarget === null) dismiss(); else hideSoon(); }}
      onFocusCapture={e => reveal(e.currentTarget)} onBlurCapture={dismiss}>
      <span className="block truncate text-[13px] leading-[17px]" aria-describedby={position ? tooltipId : undefined}>{title}</span>
      {lastActivity && <Text as="span" variant="meta" tone="subtle" className="mt-0.5 block pr-7 tabular-nums"><time dateTime={lastActivity} title={new Date(lastActivity).toLocaleString()}>
        {new Date(lastActivity).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </time></Text>}
      {position && createPortal(<Surface ref={cardRef} as="span" id={tooltipId} role="tooltip" tone="panel" border="default" radius="input" padding="sm" elevation="pop"
        onMouseEnter={keepOpen} onMouseLeave={e => { if (e.relatedTarget === null) dismiss(); else hideSoon(); }}
        style={position} className="max-h-[calc(100vh-16px)] overflow-y-auto pointer-events-auto fixed z-popover w-[min(560px,calc(100vw-16px))] whitespace-normal [overflow-wrap:anywhere]"><Text as="span" variant="body-sm" weight="medium" className="block whitespace-normal [overflow-wrap:anywhere]">{displayTitle}</Text>
        <span className="mt-2 flex flex-col gap-1">
          {lastActivity && <Text as="span" variant="meta" tone="muted">Last activity: {new Date(lastActivity).toLocaleString()}</Text>}
          {createdAt && <Text as="span" variant="meta" tone="muted">Created: {new Date(createdAt).toLocaleString()}</Text>}
          {typeof messageCount === 'number' && Number.isFinite(messageCount) && messageCount >= 0 && <Text as="span" variant="meta" tone="muted">{messageCount} {messageCount === 1 ? 'message' : 'messages'}</Text>}
          {working && <Text as="span" variant="meta" tone="info">Thinking…</Text>}
        </span>
      </Surface>, document.body)}
    </span>
  );
}
