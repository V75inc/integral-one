/**
 * Two small Thread pieces with a large blast radius.
 *
 *  - ActivityStrip returned null whenever no turn was running, BEFORE looking
 *    at `streamError`. Every error worth showing is one that ended the turn,
 *    so the error branch was unreachable and failures were silent.
 *  - SourceView rendered `href={part.url}` straight from a tool result,
 *    bypassing the scheme allow-list every markdown link goes through.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const activity = {
  activityText: null as string | null,
  isRunning: false,
  streamError: null as string | null,
};

vi.mock('../../AIChatSurface', () => ({
  useChatActivity: () => activity,
}));

import { ActivityStrip, SourceView, liveWorkSynopsis, latestActiveTool, PromptSheetResumeNote } from '../Thread';
import { hasAssistantDebugPayload } from '../assistantMessagePresentation';
import { THREAD_ALREADY_RESPONDING } from '../../threadSessionRegistry';

afterEach(() => {
  cleanup();
  activity.activityText = null;
  activity.isRunning = false;
  activity.streamError = null;
});

describe('PromptSheetResumeNote', () => {
  it('shows an approval receipt without exposing its host marker', () => {
    render(
      <PromptSheetResumeNote text={'[PROMPT_SHEET]\nUpdates applied\n• Create entry "Cordless Drill" in Equipment'} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Updates applied');
    expect(screen.getByText('Create entry "Cordless Drill" in Equipment')).toBeVisible();
    expect(screen.queryByText(/PROMPT_SHEET/)).toBeNull();
  });
});

describe('liveWorkSynopsis', () => {
  it('keeps describing a running tool when a later parallel call finishes', () => {
    const active = { type: 'tool-call', toolName: 'integral_get_index_status', status: { type: 'running' } };
    const complete = { type: 'tool-call', toolName: 'integral_list_apps', result: {}, status: { type: 'complete' } };
    expect(latestActiveTool([active, complete])).toBe('integral_get_index_status');
    expect(latestActiveTool([complete])).toBe('');
    expect(latestActiveTool([{ ...active, status: { type: 'incomplete' } }])).toBe('');
  });
  it('uses observable activity and tools, with a neutral fallback', () => {
    expect(liveWorkSynopsis('Filing your content', 'integral_list_apps')).toBe('Filing your content');
    expect(liveWorkSynopsis(undefined, 'integral_describe_substrate')).toBe('Reading the information you can access');
    expect(liveWorkSynopsis('', '')).toBe('Preparing your response');
    expect(liveWorkSynopsis('Thinking', 'integral_get_index_status')).toBe('Checking search readiness');
    expect(liveWorkSynopsis('Working…', 'integral_query_entries')).toBe('Finding relevant information');
    expect(liveWorkSynopsis(undefined, 'search_capabilities')).toBe('Finding the right way to help');
    expect(liveWorkSynopsis(undefined, 'integral_call_workspace_tool')).toBe('Working in your App');
    expect(liveWorkSynopsis(undefined, '', 2)).toBe('Reviewing the results');
    expect(liveWorkSynopsis(undefined, '', 2, true)).toBe('Writing your answer');
    expect(liveWorkSynopsis('Stopping…', 'integral_query_entries')).toBe('Stopping…');
  });

  it('keeps supplied activity to one short line without exposing tool names', () => {
    const label = liveWorkSynopsis('Checking\n' + 'your workspace '.repeat(12), 'internal_tool');
    expect(label).not.toContain('\n');
    expect(label.length).toBeLessThanOrEqual(72);
    expect(liveWorkSynopsis(undefined, 'unknown_extension_tool')).toBe('Working on the next step');
  });
});

describe('ActivityStrip', () => {
  it('shows a stream error even when no turn is running', () => {
    activity.streamError = 'The assistant could not process this request.';
    render(<ActivityStrip />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The assistant could not process this request.',
    );
  });

  it('does not render a busy thread as an error', () => {
    activity.streamError = THREAD_ALREADY_RESPONDING;
    const { container } = render(<ActivityStrip />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it('still renders nothing when idle and error-free', () => {
    const { container } = render(<ActivityStrip />);
    expect(container).toBeEmptyDOMElement();
  });

  it('does not repeat a thinking line while the work trail is live', () => {
    activity.isRunning = true;
    activity.activityText = 'Filing your content';
    const { container } = render(<ActivityStrip />);
    expect(container).toBeEmptyDOMElement();
  });

  it('prefers the error over the activity text while running', () => {
    activity.isRunning = true;
    activity.activityText = 'Filing your content';
    activity.streamError = 'Something went wrong';
    render(<ActivityStrip />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.queryByText(/Filing your content/)).toBeNull();
  });
});

describe('SourceView', () => {
  it('links a safe http(s) source', () => {
    render(
      <MemoryRouter>
        <SourceView part={{ url: 'https://example.com/doc', title: 'Doc' }} />
      </MemoryRouter>,
    );
    const a = screen.getByRole('link', { name: /Doc/ });
    expect(a).toHaveAttribute('href', 'https://example.com/doc');
    expect(a).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it.each(['javascript:alert(1)', 'data:text/html,<b>x</b>', 'vbscript:x'])(
    'renders %s as inert text, not an anchor',
    (url) => {
      render(<SourceView part={{ url, title: 'Bad' }} />);
      expect(screen.queryByRole('link')).toBeNull();
      expect(screen.getByTestId('chat-source-unsafe')).toHaveTextContent('Bad');
    },
  );
});

describe('metadata-only assistant messages', () => {
  it('exposes actions only when a real debug payload exists', () => {
    expect(
      hasAssistantDebugPayload({
        finalPayload: {
          run_id: 'run-1',
          claim_provenance: { tools: [] },
        },
      }),
    ).toBe(true);
    expect(hasAssistantDebugPayload({ finalContent: '' })).toBe(false);
    expect(hasAssistantDebugPayload(undefined)).toBe(false);
  });
});
