import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConversationLabel } from '../ConversationLabel';

const getThread = vi.hoisted(() => vi.fn());
vi.mock('../../../../api/aiChat', () => ({ aiChatApi: { getThread } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
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
  expect(screen.getByRole('tooltip')).toHaveTextContent(title);
  expect(screen.getByRole('tooltip').parentElement).toBe(document.body);
  fireEvent.mouseLeave(labelFor(title));
  await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
});

it('reveals for keyboard focus and dismisses on escape, blur, or scroll', () => {
  render(<button><ConversationLabel title={title} /></button>);
  const button = screen.getByRole('button');
  fireEvent.focus(button);
  expect(screen.getByRole('tooltip')).toHaveTextContent(title);
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  fireEvent.focus(button);
  fireEvent.scroll(window);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  fireEvent.focus(button);
  fireEvent.blur(button);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

it('keeps only one reveal open when pointer and keyboard target different rows', () => {
  render(<><button><ConversationLabel title={title} /></button><button><ConversationLabel title="Another conversation" /></button></>);
  fireEvent.mouseEnter(labelFor(title));
  fireEvent.focus(screen.getByRole('button', { name: 'Another conversation' }));
  expect(screen.getAllByRole('tooltip')).toHaveLength(1);
  expect(screen.getByRole('tooltip')).toHaveTextContent('Another conversation');
});

it('shows authorized useful metadata in the title card', () => {
  render(<button><ConversationLabel title={title} lastActivity="2026-10-08T05:15:00Z" createdAt="2026-10-07T14:00:00Z" messageCount={4} working /></button>);
  fireEvent.focus(screen.getByRole('button'));
  expect(screen.getByRole('tooltip')).toHaveTextContent('Last activity:');
  expect(screen.getByRole('tooltip')).toHaveTextContent('Created:');
  expect(screen.getByRole('tooltip')).toHaveTextContent('4 messages');
  expect(screen.getByRole('tooltip')).toHaveTextContent('Thinking…');
});

it('wraps the full title in a wider hover card without inheriting row truncation', () => {
  const fullTitle = 'Plan the community clinic volunteer rota and coordinate weekly shifts with backup coverage';
  render(<button><ConversationLabel title={fullTitle} /></button>);
  fireEvent.focus(screen.getByRole('button'));
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
  expect(await screen.findByText(full)).toBeInTheDocument();
  expect(getThread).toHaveBeenCalledWith('thread-1');
  expect(screen.getByRole('tooltip')).toHaveClass('overflow-y-auto');
});

it('keeps the actual title when opening text does not match the legacy fallback', async () => {
  const stored = `${'A'.repeat(60)}…`;
  getThread.mockResolvedValue({ title: stored, messages: [{ role: 'user', parts: [{ type: 'text', text: 'Different subject' }] }] });
  render(<button><ConversationLabel threadId="thread-2" title={stored} /></button>);
  fireEvent.focus(screen.getByRole('button'));
  await vi.waitFor(() => expect(getThread).toHaveBeenCalledWith('thread-2'));
  expect(screen.getByRole('tooltip')).toHaveTextContent(stored);
});
