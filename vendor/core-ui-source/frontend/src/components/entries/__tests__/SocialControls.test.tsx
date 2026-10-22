import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactionControl } from '../ReactionControl';
import { AttachmentGallery, EntryInlineImageGallery, orderGalleryAttachments } from '../AttachmentGallery';
import { CommentComposer } from '../comments/CommentComposer';
import type { Attachment, Reaction } from '../../../types';
const identity = vi.hoisted(() => ({ user: { id: 'me', user_id: 'me' }, token: 'session-one', workspace: 'ws-one' }));
const mocks = vi.hoisted(() => ({ select: vi.fn(), remove: vi.fn(), toast: vi.fn(), publicAdd: vi.fn() }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: identity.user, token: identity.token }) }));
vi.mock('../../../context/ScopeContext', () => ({ useScopeOptional: () => ({ scope: { workspaceId: identity.workspace } }) }));
vi.mock('../../../context/ToastContext', () => ({ useToast: () => ({ showToast: mocks.toast }) }));
vi.mock('../../../api', () => ({ entriesApi: { selectReaction: mocks.select, removeReaction: mocks.remove }, commentsApi: { selectReaction: mocks.select, removeReaction: mocks.remove } }));
vi.mock('../../../api/sharing', () => ({ publicSharingApi: { addPublicReaction: mocks.publicAdd } }));
vi.mock('../../ui', async importOriginal => ({ ...(await importOriginal<typeof import('../../ui')>()), AuthedImage: (props: any) => <img {...props} /> }));
vi.mock('../attachments/AttachmentViewerModal', () => ({ AttachmentViewerModal: ({ attachment, onNext, onClose }: any) => <div role="dialog" aria-label="Image viewer"><span>{attachment.filename}</span><button onClick={onNext}>Next image</button><button onClick={onClose}>Close viewer</button></div> }));
afterEach(cleanup);
beforeEach(() => { vi.resetAllMocks(); identity.user = { id: 'me', user_id: 'me' }; identity.token = 'session-one'; identity.workspace = 'ws-one'; });
function ReactionHarness({ target = 'entry' }: { target?: 'entry' | 'comment' }) {
  const [reactions, setReactions] = useState<Reaction[]>([]);
  return <QueryClientProvider client={new QueryClient()}><ReactionControl targetId="target" target={target} reactions={reactions} onChange={setReactions} /></QueryClientProvider>;
}
describe('compact reaction menu', () => {
  it.each(['entry', 'comment'] as const)('reveals choices on tap without mutating, then selects/changes/removes the %s reaction', async target => {
    mocks.select.mockResolvedValueOnce({ reactions: { '👍': ['me', 'other'] } }).mockResolvedValueOnce({ reactions: { '👎': ['me'], '👍': ['other'] } });
    mocks.remove.mockResolvedValue({ reactions: { '👍': ['other'] } });
    render(<ReactionHarness target={target} />);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByLabelText('React'));
    const menu = screen.getByRole('menu', { name: 'Reactions' });
    expect(within(menu).getAllByRole('menuitemradio')).toHaveLength(5);
    expect(menu.querySelectorAll('svg[fill="none"]')).toHaveLength(5);
    expect(mocks.select).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Like'));
    await screen.findByLabelText('Reactions: Like');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByLabelText('Reactions: Like').textContent).toBe('2');
    fireEvent.click(screen.getByLabelText('Reactions: Like'));
    expect(screen.getByLabelText('Remove Like').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByLabelText('Dislike'));
    await screen.findByLabelText('Reactions: Dislike');
    fireEvent.click(screen.getByLabelText('Reactions: Dislike'));
    fireEvent.click(screen.getByLabelText('Remove Dislike'));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('target', '👎'));
    await screen.findByLabelText('React');
  });
  it.each([['👍', 'Like', 'thumbs-up'], ['👎', 'Dislike', 'thumbs-down'], ['❤️', 'Love', 'heart'], ['😊', 'Happy', 'smile'], ['😢', 'Sad', 'frown']])('presents %s as the monochrome %s line icon and selects it', async (emoji, label, icon) => {
    mocks.select.mockResolvedValue({ reactions: { [emoji]: ['me'] } });
    render(<ReactionHarness />);
    fireEvent.click(screen.getByLabelText('React'));
    const choice = screen.getByLabelText(label);
    expect(choice.querySelector(`svg.lucide-${icon}[fill="none"]`)).toBeTruthy();
    expect(choice.textContent).toBe('0');
    fireEvent.click(choice);
    await screen.findByLabelText(`Reactions: ${label}`);
    expect(mocks.select).toHaveBeenCalledWith('target', emoji);
    expect(screen.getByLabelText(`Reactions: ${label}`).querySelector('svg.lucide-thumbs-up[fill="none"]')).toBeTruthy();
    fireEvent.click(screen.getByLabelText(`Reactions: ${label}`));
    expect(screen.getByLabelText(`Remove ${label}`).querySelector(`svg.lucide-${icon}[fill="none"]`)).toBeTruthy();
  });
  it('opens on desktop hover and closes on outside pointer and Escape without mutations', () => {
    render(<ReactionHarness />);
    fireEvent.mouseEnter(screen.getByLabelText('React'));
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(screen.getByLabelText('React'));
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText('React'));
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it('portals outside comment clipping containers, clamps a five-choice menu to 390px, and treats menu pointers as inside', () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) });
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.getAttribute('role') === 'menu' ? box(0, 0, 260, 46) : box(218, 120, 30, 20);
    });
    try {
      const { container } = render(<div style={{ overflow: 'hidden', width: 220 }}><ReactionHarness /></div>);
      fireEvent.click(screen.getByLabelText('React'));
      const popup = screen.getByRole('menu');
      expect(popup.parentElement).toBe(document.body);
      expect(container.contains(popup)).toBe(false);
      expect(popup.style.position === 'fixed' || popup.className.includes('fixed')).toBe(true);
      expect(parseFloat(popup.style.left)).toBe(122);
      expect(parseFloat(popup.style.left) + 260).toBeLessThanOrEqual(390 - 8);
      fireEvent.pointerDown(screen.getByLabelText('Love'));
      expect(screen.getByRole('menu')).toBeTruthy();
      expect(mocks.select).not.toHaveBeenCalled();
      fireEvent.pointerDown(document.body);
      expect(screen.queryByRole('menu')).toBeNull();
    } finally { rect.mockRestore(); Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth }); }
  });
  it('supports keyboard opening, choice navigation, and selection', async () => {
    mocks.select.mockResolvedValue({ reactions: { '👎': ['me'] } });
    render(<ReactionHarness />);
    fireEvent.keyDown(screen.getByLabelText('React'), { key: 'ArrowDown' });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Like')));
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByLabelText('Dislike'));
    fireEvent.click(document.activeElement!);
    await screen.findByLabelText('Reactions: Dislike');
    expect(mocks.select).toHaveBeenCalledWith('target', '👎');
  });
  it('allows a viewer to retract their existing choice while withholding new selection', async () => {
    mocks.remove.mockResolvedValue({ reactions: {} });
    render(<QueryClientProvider client={new QueryClient()}><ReactionControl targetId="target" reactions={[{ emoji: '👍', count: 1, user_reacted: true }]} onChange={vi.fn()} disabled /></QueryClientProvider>);
    fireEvent.click(screen.getByLabelText('Reactions: Like'));
    expect((screen.getByLabelText('Dislike') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Remove Like'));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('target', '👍'));
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it('preserves anonymous Like-only authority', async () => {
    mocks.publicAdd.mockResolvedValue({});
    render(<QueryClientProvider client={new QueryClient()}><ReactionControl targetId="target" publicToken="public" reactions={[]} onChange={vi.fn()} /></QueryClientProvider>);
    fireEvent.click(screen.getByLabelText('React'));
    expect(screen.queryByLabelText('Dislike')).toBeNull();
    expect(within(screen.getByRole('menu')).getAllByRole('menuitemradio')).toHaveLength(1);
    expect(mocks.publicAdd).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Like'));
    await waitFor(() => expect(mocks.publicAdd).toHaveBeenCalledWith('public', 'target', '👍'));
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it.each(['target', 'kind', 'public token', 'user', 'workspace', 'session'])('fences delayed responses after changing %s and admits a fresh request', async changed => {
    let resolveOld!: (value: unknown) => void;
    let resolveNew!: (value: unknown) => void;
    const old = new Promise(resolve => { resolveOld = resolve; });
    const next = new Promise(resolve => { resolveNew = resolve; });
    mocks.select.mockReturnValueOnce(old).mockReturnValueOnce(next);
    mocks.publicAdd.mockReturnValue(next);
    const oldChange = vi.fn(); const newChange = vi.fn();
    const client = new QueryClient();
    const props: { targetId: string; target: 'entry' | 'comment'; publicToken?: string } = { targetId: 'old', target: 'entry' };
    const view = (callback: (reactions: Reaction[]) => void) => <QueryClientProvider client={client}><ReactionControl {...props} reactions={[]} onChange={callback} /></QueryClientProvider>;
    const { rerender } = render(view(oldChange));
    fireEvent.click(screen.getByLabelText('React')); fireEvent.click(screen.getByLabelText('Like'));
    if (changed === 'target') props.targetId = 'new';
    if (changed === 'kind') props.target = 'comment';
    if (changed === 'public token') props.publicToken = 'public-new';
    if (changed === 'user') identity.user = { id: 'another', user_id: 'another-auth' };
    if (changed === 'workspace') identity.workspace = 'ws-two';
    if (changed === 'session') identity.token = 'session-two';
    rerender(view(newChange));
    expect(screen.queryByRole('menu')).toBeNull();
    expect((screen.getByLabelText('React') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByLabelText('React')); fireEvent.click(screen.getByLabelText('Like'));
    expect((screen.getByLabelText('React') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { resolveOld({ reactions: { '👍': ['me', 'old-other'] } }); await old; });
    expect(oldChange).not.toHaveBeenCalled(); expect(newChange).not.toHaveBeenCalled();
    expect((screen.getByLabelText('React') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { resolveNew({ reactions: { '👍': [identity.user.user_id] } }); await next; });
    expect(newChange).toHaveBeenCalledWith([{ emoji: '👍', count: 1, user_reacted: true }]);
    expect((screen.getByLabelText('React') as HTMLButtonElement).disabled).toBe(false);
    expect(mocks.toast).not.toHaveBeenCalled();
  });
  it('does not publish callbacks or errors after unmount', async () => {
    let reject!: (error: Error) => void;
    mocks.select.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
    const change = vi.fn();
    const { unmount } = render(<QueryClientProvider client={new QueryClient()}><ReactionControl targetId="old" reactions={[]} onChange={change} /></QueryClientProvider>);
    fireEvent.click(screen.getByLabelText('React')); fireEvent.click(screen.getByLabelText('Like'));
    unmount();
    await act(async () => { reject(new Error('old request failed')); });
    expect(change).not.toHaveBeenCalled(); expect(mocks.toast).not.toHaveBeenCalled();
  });
  it('serializes rapid choices and retains prior display after failure', async () => {
    let reject!: (reason: Error) => void;
    mocks.select.mockReturnValue(new Promise((_, r) => { reject = r; }));
    render(<ReactionHarness />);
    fireEvent.click(screen.getByLabelText('React'));
    fireEvent.click(screen.getByLabelText('Like')); fireEvent.click(screen.getByLabelText('Dislike'));
    expect(mocks.select).toHaveBeenCalledTimes(1);
    await act(async () => reject(new Error('denied')));
    expect(screen.getByLabelText('React').textContent).toBe('0');
    expect(mocks.toast).toHaveBeenCalled();
  });
});
const images = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `${i}`, source_type: 'file', mime_type: 'image/png', filename: `${i}.png`, download_url: `/api/${i}` } as Attachment));
describe('shared image mosaic', () => {
  it.each([1, 2, 3, 4, 5, 8])('bounds %s images, excludes blocked/nonimages, and opens the clicked attachment', count => {
    const items = images(count);
    const open = vi.fn();
    render(<AttachmentGallery attachments={[...items, { ...items[0], id: 'blocked', scan_status: 'blocked' }, { ...items[0], id: 'pdf', mime_type: 'application/pdf' }]} onOpen={open} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(Math.min(4, count));
    fireEvent.click(buttons[buttons.length - 1]);
    expect(open).toHaveBeenCalledWith(items[Math.min(3, count - 1)]);
    if (count > 4) expect(screen.getByText(`+${count - 4}`)).toBeTruthy();
    expect(screen.getAllByRole('img').every(image => image.className.includes(count === 1 ? 'object-contain' : 'object-cover'))).toBe(true);
    if (count === 3) expect(buttons[0].className).toContain('row-span-2');
  });
  it('uses the same stable order for reversed inputs and only promotes an explicit cover', () => {
    const items = images(6).map((image, index) => ({ ...image, created_at: `2026-10-21T00:00:0${index}Z` }));
    const ascending = orderGalleryAttachments(items);
    expect(orderGalleryAttachments([...items].reverse())).toEqual(ascending);
    expect(orderGalleryAttachments([...items].reverse(), '3').map(a => a.id)).toEqual(['3', '0', '1', '2', '4', '5']);
    const { unmount } = render(<AttachmentGallery attachments={items} onOpen={vi.fn()} />);
    const feedLabels = screen.getAllByRole('button').map(button => button.getAttribute('aria-label'));
    unmount();
    render(<EntryInlineImageGallery attachments={[...items].reverse()} />);
    expect(screen.getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual(feedLabels);
    fireEvent.click(screen.getByLabelText('Open image 4 of 6: 3.png'));
    fireEvent.click(screen.getByText('Next image'));
    expect(within(screen.getByRole('dialog')).getByText('4.png')).toBeTruthy();
  });
  it('renders identical detail/feed image choices and opens the selected detail image with navigation to hidden images', () => {
    const items = images(6);
    const { unmount } = render(<AttachmentGallery attachments={items} primaryId="2" onOpen={vi.fn()} />);
    const feedLabels = screen.getAllByRole('button').map(button => button.getAttribute('aria-label'));
    unmount();
    render(<EntryInlineImageGallery attachments={items} primaryId="2" />);
    expect(screen.getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual(feedLabels);
    fireEvent.click(screen.getByLabelText('Open image 4 of 6: 3.png'));
    expect(within(screen.getByRole('dialog')).getByText('3.png')).toBeTruthy();
    fireEvent.click(screen.getByText('Next image'));
    expect(within(screen.getByRole('dialog')).getByText('4.png')).toBeTruthy();
    fireEvent.click(screen.getByText('Close viewer'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
describe('plain comment composer', () => {
  it('accepts Unicode and mentions as authored text without an emoji picker', () => {
    const submit = vi.fn();
    function Composer() { const [value, change] = useState(''); return <CommentComposer value={value} onChange={change} onSubmit={submit} mentions={false} />; }
    render(<Composer />);
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Hi 👩🏽‍💻 @alice 👍' } });
    expect(input.value).toBe('Hi 👩🏽‍💻 @alice 👍');
    expect(screen.queryByLabelText('Insert emoji')).toBeNull();
    expect(screen.queryByLabelText('Emoji picker')).toBeNull();
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Send comment'));
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
it('keeps reactions available in detail when the separate panel hides the comment shortcut', async () => {
  const { EntrySocialActions } = await import('../EntrySocialActions');
  render(<QueryClientProvider client={new QueryClient()}><EntrySocialActions entryId="entry" trackId="track" reactions={[]} onReactionsChange={() => {}} commentCount={1} onCommentsClick={() => {}} hideComments /></QueryClientProvider>);
  fireEvent.click(screen.getByLabelText('React'));
  expect(screen.getByLabelText('Like')).toBeTruthy();
  expect(screen.getByLabelText('Dislike')).toBeTruthy();
  expect(screen.queryByLabelText('Comments')).toBeNull();
});
