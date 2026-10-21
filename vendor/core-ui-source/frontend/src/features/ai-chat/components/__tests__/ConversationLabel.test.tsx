import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ConversationLabel, CONVERSATION_PREVIEW_DELAY_MS } from '../ConversationLabel';

const getThread = vi.hoisted(() => vi.fn());
vi.mock('../../../../api/aiChat', () => ({ aiChatApi: { getThread } }));
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });
const revealAfterDelay = () => act(() => vi.advanceTimersByTime(CONVERSATION_PREVIEW_DELAY_MS));
const labelFor = (value: string) => screen.getAllByText(value).find(node => node.classList.contains('truncate'))!.parentElement!;
const title = 'For my saved Volunteer rota venture, prepare the next private rehearsal';

it('uses the full width for a compact single-line title and separates its timestamp', () => {
  render(<button><ConversationLabel title={title} lastActivity="2026-10-08T05:15:00Z" /></button>);
  expect(screen.getByText(title)).toHaveClass('truncate');
  expect(document.querySelector('time')?.parentElement).toHaveClass('block');
});

it('reveals the full name on hover outside the scrolling rail and dismisses it', async () => {
  render(<button><ConversationLabel title={title} /></button>);
  fireEvent.mouseEnter(labelFor(title));
  revealAfterDelay();
  expect(screen.getByRole('tooltip')).toHaveTextContent(title);
  expect(screen.getByRole('tooltip').parentElement).toBe(document.body);
  fireEvent.mouseLeave(labelFor(title));
  act(() => vi.advanceTimersByTime(120));
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

it('reveals for keyboard focus and dismisses on escape, blur, or scroll', () => {
  render(<button><ConversationLabel title={title} /></button>);
  const button = screen.getByRole('button');
  fireEvent.focus(button);
  revealAfterDelay();
  expect(screen.getByRole('tooltip')).toHaveTextContent(title);
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  fireEvent.focus(button);
  revealAfterDelay();
  fireEvent.scroll(window);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  fireEvent.focus(button);
  revealAfterDelay();
  fireEvent.blur(button);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

it('keeps only one reveal open when pointer and keyboard target different rows', () => {
  render(<><button><ConversationLabel title={title} /></button><button><ConversationLabel title="Another conversation" /></button></>);
  fireEvent.mouseEnter(labelFor(title));
  revealAfterDelay();
  fireEvent.focus(screen.getByRole('button', { name: 'Another conversation' }));
  revealAfterDelay();
  expect(screen.getAllByRole('tooltip')).toHaveLength(1);
  expect(screen.getByRole('tooltip')).toHaveTextContent('Another conversation');
});

it('shows authorized useful metadata in the title card', () => {
  render(<button><ConversationLabel title={title} lastActivity="2026-10-08T05:15:00Z" createdAt="2026-10-07T14:00:00Z" messageCount={4} working /></button>);
  fireEvent.focus(screen.getByRole('button'));
  revealAfterDelay();
  expect(screen.getByRole('tooltip')).toHaveTextContent('Last activity:');
  expect(screen.getByRole('tooltip')).toHaveTextContent('Created:');
  expect(screen.getByRole('tooltip')).toHaveTextContent('4 messages');
  expect(screen.getByRole('tooltip')).toHaveTextContent('Thinking…');
});

it('wraps the full title in a wider hover card without inheriting row truncation', () => {
  const fullTitle = 'Plan the community clinic volunteer rota and coordinate weekly shifts with backup coverage';
  render(<button><ConversationLabel title={fullTitle} /></button>);
  fireEvent.focus(screen.getByRole('button'));
  revealAfterDelay();
  const card = screen.getByRole('tooltip');
  expect(card).toHaveClass('whitespace-normal', 'w-[min(560px,calc(100vw-16px))]');
  expect(card).toHaveTextContent(fullTitle);
  expect(card.querySelector('.truncate')).toBeNull();
  fireEvent.scroll(card);
  expect(screen.getByRole('tooltip')).toBeInTheDocument();
  fireEvent.resize(window);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});


it('recovers a stored 60-character fallback title only when its full opening text matches', async () => {
  const full = '🗓 Prepare a complete volunteer rota with backup coverage for every morning and afternoon shift';
  const stored = `${Array.from(full).slice(0, 60).join('')}…`;
  getThread.mockResolvedValue({ title: stored, messages: [{ role: 'user', parts: [{ type: 'text', text: full }] }] });
  render(<button><ConversationLabel threadId="thread-1" title={stored} /></button>);
  expect(getThread).not.toHaveBeenCalled();
  fireEvent.focus(screen.getByRole('button'));
  revealAfterDelay();
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByText(full)).toBeInTheDocument();
  expect(getThread).toHaveBeenCalledWith('thread-1');
  expect(screen.getByRole('tooltip')).toHaveClass('overflow-y-auto');
});

it('keeps the actual title when opening text does not match the legacy fallback', async () => {
  const stored = `${'A'.repeat(60)}…`;
  getThread.mockResolvedValue({ title: stored, messages: [{ role: 'user', parts: [{ type: 'text', text: 'Different subject' }] }] });
  render(<button><ConversationLabel threadId="thread-2" title={stored} /></button>);
  fireEvent.focus(screen.getByRole('button'));
  revealAfterDelay();
  await act(async () => { await Promise.resolve(); });
  expect(getThread).toHaveBeenCalledWith('thread-2');
  expect(screen.getByRole('tooltip')).toHaveTextContent(stored);
});

it('waits for sustained hover and cancels when moving between rows', () => {
  render(<button><ConversationLabel title={title} threadId="delayed" /></button>);
  const label = labelFor(title);
  fireEvent.mouseEnter(label);
  act(() => vi.advanceTimersByTime(CONVERSATION_PREVIEW_DELAY_MS - 1));
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  expect(getThread).not.toHaveBeenCalled();
  fireEvent.mouseLeave(label);
  revealAfterDelay();
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  fireEvent.mouseEnter(label);
  revealAfterDelay();
  expect(screen.getByRole('tooltip')).toHaveTextContent(title);
});
it.each(['click', 'blur', 'scroll', 'resize', 'escape'])('cancels a pending preview on %s', event => {
  render(<button><ConversationLabel title={title} /></button>);
  fireEvent.mouseEnter(labelFor(title));
  if (event === 'click') fireEvent.click(screen.getByRole('button'));
  if (event === 'blur') fireEvent.blur(screen.getByRole('button'));
  if (event === 'scroll') fireEvent.scroll(window);
  if (event === 'resize') fireEvent.resize(window);
  if (event === 'escape') fireEvent.keyDown(window, { key: 'Escape' });
  revealAfterDelay();
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});
it('cancels stale previews when a row changes identity or unmounts', () => {
  const view = render(<button><ConversationLabel title={title} threadId="old" /></button>);
  fireEvent.mouseEnter(labelFor(title));
  view.rerender(<button><ConversationLabel title="New title" threadId="new" /></button>);
  revealAfterDelay();
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  fireEvent.mouseEnter(labelFor('New title'));
  view.unmount();
  revealAfterDelay();
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});
