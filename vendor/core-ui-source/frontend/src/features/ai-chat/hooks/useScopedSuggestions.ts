import { useMemo } from 'react';
import { useScope } from '../../../context/ScopeContext';
import { useChatPageContext } from '../../../context/ChatPageFocusContext';

export interface Suggestion {
  label: string;
  text: string;
}

/**
 * Returns scope-aware suggestion chips for the assistant empty state.
 *
 * Tiers:
 *  - page-context (when pageKind is known): page-specific getting-started prompts
 *  - workspace-level (no sub-context): generic activity / search prompts
 *  - personal workspace: personal productivity prompts
 *  - org workspace: team-oriented prompts
 */
export function useScopedSuggestions(): Suggestion[] {
  const { activeWorkspace, isPersonal } = useScope();
  const { pageKind, focusedTrackId, focusedAppId } = useChatPageContext();

  return useMemo((): Suggestion[] => {
    const workspaceName = activeWorkspace?.name;
    const pageChips = pageContextSuggestions(pageKind, {
      focusedTrackId,
      focusedAppId,
      workspaceName,
    });
    if (pageChips.length > 0) {
      return pageChips;
    }

    if (!workspaceName) {
      // No workspace resolved yet — return generic fallbacks
      return [
        {
          label: 'What can you help me with?',
          text: 'What can you help me with in this workspace?',
        },
        {
          label: 'Catch me up',
          text: 'Summarize recent activity across my tracks and entries.',
        },
        {
          label: 'Help me find something',
          text: "Help me find entries or content I've been working on.",
        },
      ];
    }

    if (isPersonal) {
      // Personal workspace — individual productivity prompts
      return [
        {
          label: 'What’s new here?',
          text: `Give me a summary of recent activity in my ${workspaceName} workspace.`,
        },
        {
          label: 'Help me organize my work',
          text: 'Can you help me organize my tracks and entries more effectively?',
        },
        {
          label: 'What needs my attention?',
          text: "Which entries in my workspace haven't been updated recently?",
        },
        {
          label: 'Help me get started',
          text: 'Help me set up a useful way to organize my work. Ask me what I want to keep track of.',
        },
      ];
    }

    // Organization workspace — team-oriented prompts
    return [
      {
        label: 'What’s new here?',
        text: `Give me a summary of recent team activity in the ${workspaceName} workspace.`,
      },
      {
        label: 'What’s still outstanding?',
        text: `What are the open or in-progress items across tracks in ${workspaceName}?`,
      },
      {
        label: 'Help me write an update',
        text: 'Help me draft a new entry. What information should I capture?',
      },
      {
        label: 'How could we organize this better?',
        text: `Review the content structure in ${workspaceName} and suggest improvements.`,
      },
    ];
  }, [
    activeWorkspace?.name,
    isPersonal,
    pageKind,
    focusedTrackId,
    focusedAppId,
  ]);
}

function pageContextSuggestions(
  pageKind: string | null,
  ctx: {
    focusedTrackId: string | null;
    focusedAppId: string | null;
    workspaceName?: string;
  },
): Suggestion[] {
  if (!pageKind) return [];

  switch (pageKind) {
    case 'tracks_list':
      return [
        {
          label: 'Help me set up a track',
          text: 'Help me create a track for my work. Ask me what I want to keep track of and suggest a useful way to organize it.',
        },
        {
          label: 'Help me organize this workspace',
          text: 'What tracks should I create to organize this workspace effectively?',
        },
        {
          label: 'Summarize my tracks',
          text: ctx.workspaceName
            ? `Summarize the tracks in ${ctx.workspaceName} and suggest gaps.`
            : 'Summarize my tracks and suggest gaps.',
        },
      ];
    case 'feed':
      return [
        {
          label: 'Help me write an update',
          text: 'Help me draft a new feed entry. Ask me what to capture.',
        },
        {
          label: 'Catch me up on recent activity',
          text: 'Summarize recent activity in my feed and call out anything that needs attention.',
        },
        {
          label: 'What should I post next?',
          text: 'Based on recent workspace activity, what should I post or update next?',
        },
      ];
    case 'track_detail':
      return [
        {
          label: 'Help me add something here',
          text: ctx.focusedTrackId
            ? 'Help me draft a new entry for this track. What details should I include?'
            : 'Help me draft a new entry for the track I am viewing.',
        },
        {
          label: 'Summarize this track',
          text: 'Summarize the entries in this track and highlight open items.',
        },
        {
          label: 'What’s the best way to view this?',
          text: 'Suggest a useful view (board, table, or feed) for this track.',
        },
      ];
    case 'apps_list':
    case 'app_detail':
      return [
        {
          label: 'Help me set up an app',
          text: 'Help me set up an app for this workspace. Ask me what I need it for, then suggest how to organize the work.',
        },
        {
          label: ctx.focusedAppId ? 'How does this app work?' : 'What can I do with apps?',
          text: ctx.focusedAppId
            ? 'Explain the structure of the app I am viewing and how tracks relate.'
            : 'Explain how apps, tracks, and entries fit together in Integral.',
        },
      ];
    case 'settings':
      return [
        {
          label: 'Help me choose an AI model',
          text: 'Integral AI is my built-in assistant. Explain how to connect an AI model in Settings → AI Models and help me choose a model for my work.',
        },
        {
          label: 'Help me get started',
          text: 'Walk me through getting started with Integral in this workspace.',
        },
      ];
    default:
      return [];
  }
}
