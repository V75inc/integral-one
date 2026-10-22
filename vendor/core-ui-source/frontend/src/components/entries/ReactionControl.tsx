import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Frown, Heart, Smile, ThumbsDown, ThumbsUp } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { entriesApi, commentsApi } from '../../api';
import { publicSharingApi } from '../../api/sharing';
import { normalizeReactions } from '../../api/helpers';
import { useAuth } from '../../context/AuthContext';
import { useScopeOptional } from '../../context/ScopeContext';
import { useToast } from '../../context/ToastContext';
import { invalidateFeedCaches } from '../../queryKeys';
import { Surface, Text } from '../../ui';
import { LINE_ICON_STROKE } from '../ui';
import type { Reaction } from '../../types';
import { REACTION_OPTIONS } from './reactionOptions';

const REACTION_ICONS: Record<string, typeof ThumbsUp> = {
  '👍': ThumbsUp, '👎': ThumbsDown, '❤️': Heart, '😊': Smile, '😢': Frown,
};

export function ReactionControl({ targetId, target = 'entry', reactions, onChange, disabled = false, publicToken }: {
  targetId: string;
  target?: 'entry' | 'comment';
  reactions: Reaction[];
  onChange: (next: Reaction[]) => void;
  disabled?: boolean;
  publicToken?: string;
}) {
  const { user, token } = useAuth();
  const scope = useScopeOptional();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const binding = useRef<object | null>(null);
  const inFlight = useRef(false);
  const selected = reactions.find(reaction => reaction.user_reacted)?.emoji;
  const selectedLabel = REACTION_OPTIONS.find(([emoji]) => emoji === selected)?.[1];
  const total = reactions.reduce((sum, reaction) => sum + reaction.count, 0);
  const canOpen = !busy && (!disabled || Boolean(selected));
  const cancelClose = () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  // Each committed target/session owns its UI work; renders alone do not
  // retire a still-visible binding. Cleanup also fences unmounted responses.
  useLayoutEffect(() => {
    const generation = {};
    binding.current = generation;
    inFlight.current = false;
    cancelClose();
    setBusy(false);
    setOpen(false);
    setMenuPosition(null);
    return () => {
      if (binding.current === generation) binding.current = null;
      cancelClose();
    };
  }, [target, targetId, publicToken, user?.id, user?.user_id, token, scope?.scope?.workspaceId]);
  const close = (restoreFocus = false) => {
    cancelClose();
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  };
  const openMenu = (focus = false) => {
    cancelClose();
    if (!canOpen) return;
    if (!open) setMenuPosition(null);
    setOpen(true);
    const generation = binding.current;
    if (focus) requestAnimationFrame(() => {
      if (generation === binding.current) menu.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"]:not(:disabled)')?.focus();
    });
  };
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      const popup = menu.current?.getBoundingClientRect();
      if (!anchor || !popup) return;
      const margin = 8;
      const left = Math.max(margin, Math.min(anchor.left, window.innerWidth - popup.width - margin));
      const above = anchor.top - popup.height - margin;
      const top = above >= margin ? above : Math.max(margin, Math.min(anchor.bottom + margin, window.innerHeight - popup.height - margin));
      setMenuPosition({ left, top });
    };
    place();
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); document.removeEventListener('scroll', place, true); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  const select = async (emoji: string) => {
    const active = reactions.some(reaction => reaction.emoji === emoji && reaction.user_reacted);
    if ((disabled && !active) || inFlight.current) return;
    const generation = binding.current;
    const current = () => generation !== null && generation === binding.current;
    inFlight.current = true;
    setBusy(true);
    try {
      const api = target === 'entry' ? entriesApi : commentsApi;
      if (publicToken) {
        // Public shares retain their existing Like-only toggle contract.
        if (active) await publicSharingApi.removePublicReaction(publicToken, targetId, emoji);
        else await publicSharingApi.addPublicReaction(publicToken, targetId, emoji);
        if (!current()) return;
        const next = reactions.map(reaction => reaction.emoji === emoji
          ? { ...reaction, count: reaction.count + (active ? -1 : 1), user_reacted: !active } : reaction);
        if (!next.some(reaction => reaction.emoji === emoji)) next.push({ emoji, count: 1, user_reacted: true });
        onChange(next.filter(reaction => reaction.count > 0));
      } else {
        const result = active
          ? await api.removeReaction(targetId, emoji)
          : await api.selectReaction(targetId, emoji);
        if (!current()) return;
        onChange(normalizeReactions(result.reactions, user?.user_id || user?.id));
        if (current()) void invalidateFeedCaches(queryClient);
      }
      if (current()) close(true);
    } catch { if (current()) showToast('Failed to update reaction', 'error'); }
    finally { if (current()) { inFlight.current = false; setBusy(false); } }
  };
  const options = publicToken ? REACTION_OPTIONS.slice(0, 1) : REACTION_OPTIONS;
  return (
    <div ref={container} className="relative inline-flex" onClick={event => event.stopPropagation()}
      onMouseEnter={() => openMenu()} onMouseLeave={() => { cancelClose(); closeTimer.current = setTimeout(() => setOpen(false), 180); }}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
        if (event.key === 'Tab') close();
      }}>
      <button ref={trigger} type="button" disabled={!canOpen} aria-haspopup="menu" aria-expanded={open}
        aria-label={selectedLabel ? `Reactions: ${selectedLabel}` : 'React'}
        onClick={event => openMenu(event.detail === 0)}
        onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); openMenu(true); } }}
        className="inline-flex items-center gap-1.5 rounded-sm disabled:opacity-50 focus-visible:outline focus-visible:outline-2">
        <Text variant="meta" tone={selected ? 'default' : 'muted'} weight={selected ? 'semibold' : 'normal'}>
          <span className="inline-flex items-center gap-1.5"><ThumbsUp size={14} strokeWidth={LINE_ICON_STROKE} fill="none" aria-hidden /><span className="tabular-nums">{total}</span></span>
        </Text>
      </button>
      {open && createPortal(<Surface ref={menu} role="menu" aria-label="Reactions" tone="panel" padding="xs" elevation="pop"
        className="fixed z-popover flex w-max max-w-[calc(100vw-1rem)] flex-wrap gap-1"
        style={{ top: menuPosition?.top ?? 0, left: menuPosition?.left ?? 0, visibility: menuPosition ? 'visible' : 'hidden' }}
        onMouseEnter={cancelClose} onMouseLeave={() => { cancelClose(); closeTimer.current = setTimeout(() => setOpen(false), 180); }}
        onKeyDown={event => {
          const buttons = [...(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]:not(:disabled)'))];
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          let next = index;
          if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % buttons.length;
          else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + buttons.length) % buttons.length;
          else if (event.key === 'Home') next = 0;
          else if (event.key === 'End') next = buttons.length - 1;
          else return;
          event.preventDefault();
          buttons[next]?.focus();
        }}>
        {options.map(([emoji, label]) => {
          const reaction = reactions.find(item => item.emoji === emoji);
          const active = Boolean(reaction?.user_reacted);
          const Icon = REACTION_ICONS[emoji] || ThumbsUp;
          return <button key={emoji} type="button" role="menuitemradio" aria-checked={active}
            disabled={(disabled && !active) || busy} aria-label={active ? `Remove ${label}` : label} title={label}
            className="inline-flex items-center justify-center gap-1 rounded-sm p-2 disabled:opacity-50 focus-visible:outline focus-visible:outline-2"
            onClick={() => void select(emoji)}>
            <Text variant="meta" tone={active ? 'default' : 'muted'} weight={active ? 'semibold' : 'normal'}>
              <span className="inline-flex items-center gap-1.5"><Icon size={18} strokeWidth={LINE_ICON_STROKE} fill="none" aria-hidden /><span className="tabular-nums">{reaction?.count || 0}</span></span>
            </Text>
          </button>;
        })}
      </Surface>, document.body)}
    </div>
  );
}
