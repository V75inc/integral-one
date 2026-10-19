import { createContext, useContext, useMemo, useState } from "react";
import {
  AuiIf,
  ThreadListItemMorePrimitive,
  ThreadListItemPrimitive,
  ThreadListPrimitive,
  useAuiState,
  useThreadListItem,
  useThreadListItemRuntime,
} from "@assistant-ui/react";
import { ArchiveIcon, Loader2, MoreHorizontalIcon, PencilIcon, PlusIcon, SearchIcon, TrashIcon, XIcon } from "lucide-react";

import { groupThreadsByRecency, type ThreadGroupInfo } from "../threadGrouping";

import { ConversationLabel } from "./ConversationLabel";

import { AgentSwitcher } from "./AgentSwitcher";
import { useActiveChatProvider } from "../useActiveChatProvider";
import { useChatActivity } from "../AIChatSurface";
import { useConfirm } from "../../../context/ConfirmContext";
import { useScope } from "../../../context/ScopeContext";

const VisibleThreadGroups = createContext<ReadonlyMap<string, ThreadGroupInfo> | null>(null);

/**
 * Thread switcher rail — assistant-ui reference layout, Integral chrome.
 *
 * Composes:
 *   AgentSwitcher                (provider catalog + active agent picker)
 *   ThreadListPrimitive.Root
 *     ├─ ThreadListNew         "+ New Thread"
 *     └─ ThreadListPrimitive.Items
 *          └─ ThreadListItem (hover-revealed more menu: Archive, Delete)
 */
export function AIChatThreadList() {
  const provider = useActiveChatProvider();
  const { scope } = useScope();
  const workspaceId = scope?.workspaceId ?? "";
  const { isRunning, streamingThreadIds, threads } = useChatActivity();
  const [search, setSearch] = useState("");
  const visibleGroups = useMemo(() => {
    const terms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return groupThreadsByRecency(threads.filter(t => !t.archived && terms.every(term =>
      (t.title || "New conversation").toLocaleLowerCase().includes(term),
    )).map(t => ({ id: t.id, ts: t.last_message_at || t.updated_at || t.created_at ? new Date((t.last_message_at ?? t.updated_at ?? t.created_at)!).getTime() : null })), Date.now());
  }, [threads, search]);

  return (
    <aside
      className="
        flex h-full min-h-0 w-full flex-1 flex-col
        border-r border-[var(--border-subtle)] bg-[var(--panel)]
      "
    >
      <AgentSwitcher
        provider={provider}
        workspaceId={workspaceId}
        isStreaming={isRunning || streamingThreadIds.length > 0}
      />

      <header
        className="
          flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-3 pt-4 pb-2
        "
      >
        <span className="text-xs uppercase tracking-wide text-[var(--text-subtle)]">
          Conversations
        </span>
        <ThreadListNew />
      </header>

      <div className="px-3 py-2">
        <div className="relative">
          <SearchIcon size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" aria-hidden />
          <input type="search" aria-label="Search conversations" placeholder="Search conversations…"
            value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === "Escape") setSearch(""); }}
            className="h-9 w-full rounded-[var(--radius-input)] border border-[var(--panel-border)] bg-[var(--bg)] pl-9 pr-8 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring-color)]" />
          {search && <button type="button" aria-label="Clear conversation search" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"><XIcon size={14} /></button>}
        </div>
        {search.trim() && <p role="status" className="pt-2 text-xs text-[var(--text-muted)]">{visibleGroups.size} matching conversations</p>}
      </div>
      <VisibleThreadGroups.Provider value={visibleGroups}>
      <ThreadListPrimitive.Root className="flex flex-1 min-h-0 flex-col gap-1 overflow-y-auto p-2">
        <AuiIf condition={(s) => s.threads.isLoading}>
          <ThreadListSkeleton />
        </AuiIf>
        <AuiIf condition={(s) => !s.threads.isLoading}>
          <ThreadListPrimitive.Items>
            {() => <ThreadListItem />}
          </ThreadListPrimitive.Items>
        </AuiIf>
        {search.trim() && visibleGroups.size === 0 && <p className="px-3 py-4 text-sm text-[var(--text-muted)]">No conversations match. Try a different name.</p>}
      </ThreadListPrimitive.Root>
      </VisibleThreadGroups.Provider>
    </aside>
  );
}

function ThreadListNew() {
  return (
    <ThreadListPrimitive.New
      aria-label="New conversation"
      title="New conversation"
      className="
        inline-flex h-7 w-7 shrink-0 items-center justify-center
        rounded-full shadow-sm
        bg-[var(--cta-bg)] text-[var(--cta-fg)]
        transition-colors hover:bg-[var(--cta-hover)]
        focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)]
      "
    >
      <PlusIcon size={14} strokeWidth={2.25} />
    </ThreadListPrimitive.New>
  );
}

function ThreadListSkeleton() {
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          role="status"
          aria-label="Loading conversations"
          className="flex h-9 items-center px-3"
        >
          <div className="h-3 w-full animate-pulse rounded-[var(--radius-input)] bg-[var(--panel-2)]" />
        </div>
      ))}
    </div>
  );
}

function ThreadGroupHeader({ label }: { label: string }) {
  return (
    <div
      className="
        sticky top-0 z-10 -mx-2 px-5 pb-1 pt-3
        bg-[var(--panel)] text-[11px] font-medium
        uppercase tracking-wide text-[var(--text-subtle)]
      "
    >
      {label}
    </div>
  );
}

function ThreadListItem() {
  const threadId = useAuiState((s) => s.threadListItem.id);
  const { threadGroups, threads, isThreadStreaming } = useChatActivity();
  const title = useThreadListItem(s => s.title);
  const thread = threads.find(t => t.id === threadId);
  const lastActivity = thread?.last_message_at ?? thread?.updated_at ?? thread?.created_at;
  const visibleGroups = useContext(VisibleThreadGroups);
  const group = (visibleGroups ?? threadGroups).get(threadId);
  if (visibleGroups && !visibleGroups.has(threadId)) return null;

  return (
    <>
      {group?.isFirst && <ThreadGroupHeader label={group.label} />}
      <ThreadListItemPrimitive.Root
        className="
          group relative flex min-h-[40px] items-center gap-1
          rounded-[var(--radius-input)]
          transition-colors duration-fast
          hover:bg-[var(--panel-2)] focus-visible:bg-[var(--panel-2)]
          data-[active]:bg-[var(--nav-active-bg)]
        "
      >
      <ThreadListItemPrimitive.Trigger
        className="
          flex h-full min-w-0 flex-1 items-start gap-2 px-2 py-1.5
          text-left text-[13px] text-[var(--text)]
          focus:outline-none
        "
      >
        <ThreadListItemStreamingSpinner />
        <ConversationLabel threadId={threadId} title={title || "New conversation"} lastActivity={lastActivity}
          createdAt={thread?.created_at} messageCount={thread?.message_count} working={isThreadStreaming(threadId)} />
      </ThreadListItemPrimitive.Trigger>
        <ThreadListItemMore />
      </ThreadListItemPrimitive.Root>
    </>
  );
}

/**
 * Busy indicator for a conversation row. Must read from React context — not
 * via `AuiIf` — because assistant-ui store updates alone do not fire when a
 * background stream starts or ends.
 *
 * Uses `isThreadStreaming` rather than the raw `streamingThreadIds` so a turn
 * running elsewhere (a routine, another window) shows here too. Reading the
 * list directly meant the row looked idle while the agent was working on it.
 */
function ThreadListItemStreamingSpinner() {
  const threadId = useAuiState((s) => s.threadListItem.id);
  const { isThreadStreaming } = useChatActivity();
  if (!isThreadStreaming(threadId)) return null;
  return (
    <Loader2
      size={14}
      className="shrink-0 animate-spin text-[var(--text-subtle)]"
      aria-hidden
    />
  );
}

function ThreadListItemMore() {
  const itemRuntime = useThreadListItemRuntime();
  const title = useThreadListItem((s) => s.title);
  const confirm = useConfirm();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [renameError, setRenameError] = useState("");
  const saveName = async () => {
    const name = draft.trim();
    if (!name || saving) return;
    setSaving(true);
    setRenameError("");
    try { await itemRuntime.rename(name); setRenaming(false); }
    catch { setRenameError("Could not rename. Try again."); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    const name = title?.trim();
    const ok = await confirm({
      title: "Delete conversation?",
      message: name
        ? `“${name}” will be permanently deleted. This can’t be undone.`
        : "This conversation will be permanently deleted. This can’t be undone.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    await itemRuntime.delete();
  };

  if (renaming) return (
    <form className="absolute inset-0 z-20 flex items-center gap-1 rounded-[var(--radius-input)] bg-[var(--panel)] px-1" onSubmit={e => { e.preventDefault(); void saveName(); }}>
      <input autoFocus aria-label="Conversation name" maxLength={200} value={draft} disabled={saving}
        onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Escape" && !saving) setRenaming(false); }}
        className="h-8 min-w-0 flex-1 rounded border border-[var(--panel-border)] bg-[var(--bg)] px-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring-color)]" />
      <button type="submit" disabled={saving || !draft.trim()} className="text-xs text-[var(--text)]">{saving ? "Saving…" : "Save"}</button>
      <button type="button" aria-label="Cancel rename" disabled={saving} onClick={() => setRenaming(false)}><XIcon size={14} /></button>
      {renameError && <span role="alert" className="absolute left-0 top-full z-30 rounded bg-[var(--panel)] p-2 text-xs text-[var(--danger-fg)]">{renameError}</span>}
    </form>
  );

  return (
    <ThreadListItemMorePrimitive.Root>
      <ThreadListItemMorePrimitive.Trigger
        aria-label={`Options for ${title || "New conversation"}`}
        className="
          mr-1 flex h-7 w-7 shrink-0 items-center justify-center
          rounded-[var(--radius-input)]
          text-[var(--text-muted)]
          transition-opacity hover:bg-[var(--panel)]
          hover:text-[var(--text)]
          group-hover:opacity-100
          data-[state=open]:bg-[var(--panel)] data-[state=open]:opacity-100
          data-[state=open]:text-[var(--text)]
          focus:outline-none focus:opacity-100
        "
      >
        <MoreHorizontalIcon size={14} />
      </ThreadListItemMorePrimitive.Trigger>
      <ThreadListItemMorePrimitive.Content
        side="bottom"
        align="start"
        className={`
          z-popover min-w-32 overflow-hidden rounded-[var(--radius-input)]
          border border-[var(--panel-border)] bg-[var(--panel)] p-1
          text-sm text-[var(--text)] shadow-[var(--shadow-pop)]
        `}
      >
        <ThreadListItemMorePrimitive.Item onSelect={() => { setDraft(title || ""); setRenameError(""); setRenaming(true); }}
          className="flex cursor-pointer select-none items-center gap-2 rounded-[var(--radius-input)] px-2 py-1.5 outline-none hover:bg-[var(--panel-2)] focus:bg-[var(--panel-2)]">
          <PencilIcon size={14} /> Rename
        </ThreadListItemMorePrimitive.Item>
        <ThreadListItemPrimitive.Archive asChild>
          <ThreadListItemMorePrimitive.Item
            className="
              flex cursor-pointer select-none items-center gap-2
              rounded-[var(--radius-input)] px-2 py-1.5
              outline-none hover:bg-[var(--panel-2)]
              focus:bg-[var(--panel-2)]
            "
          >
            <ArchiveIcon size={14} />
            Archive
          </ThreadListItemMorePrimitive.Item>
        </ThreadListItemPrimitive.Archive>
        <ThreadListItemMorePrimitive.Item
            onSelect={() => {
              void handleDelete();
            }}
            className="
              flex cursor-pointer select-none items-center gap-2
              rounded-[var(--radius-input)] px-2 py-1.5
              text-[var(--danger-fg)]
              outline-none hover:bg-[var(--danger-bg)]
              focus:bg-[var(--danger-bg)]
            "
          >
            <TrashIcon size={14} />
            Delete
          </ThreadListItemMorePrimitive.Item>
      </ThreadListItemMorePrimitive.Content>
    </ThreadListItemMorePrimitive.Root>
  );
}
