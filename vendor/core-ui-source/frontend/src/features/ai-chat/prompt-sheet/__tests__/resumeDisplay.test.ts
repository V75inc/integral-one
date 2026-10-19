import { describe, expect, it } from 'vitest';

import {
  isPromptSheetResume,
  parsePromptSheetResume,
  promptSheetResumeDisplay,
} from '../resumeDisplay';
import { resumeIfNeeded } from '../usePromptQueue';

describe('prompt sheet resume display', () => {
  it('retains the receipt without starting a second model run for a chat-owned decision', async () => {
    const notes: string[] = [];
    const runs: unknown[] = [];
    const runtime = { getState: () => ({ messages: [] }), startRun: (config: unknown) => runs.push(config) };
    await resumeIfNeeded(runtime as never, 'Updates applied', async (text) => { notes.push(text); return 'receipt'; }, () => true, false);
    expect(notes).toEqual(['Updates applied']);
    expect(runs).toEqual([]);
  });
  it('renders the resolved review and starts a host continuation without a user message', async () => {
    const appended: Array<{ role: string; content: Array<{ type: string; text: string }> }> = [];
    const runs: unknown[] = [];
    const notes: string[] = [];
    const runtime = {
      getState: () => ({ messages: [{ id: 'review-note' }] }),
      startRun: (config: unknown) => runs.push(config),
    };
    const review = '[PROMPT_SHEET]\nUpdates applied\n• Draft diff (not published): added views: Table';

    await resumeIfNeeded(runtime as never, review, (text) => { notes.push(text); });

    expect(appended).toEqual([]);
    expect(notes).toEqual([review]);
    expect(runs).toEqual([
      {
        parentId: 'review-note',
        sourceId: null,
        runConfig: { custom: { hostAction: 'prompt_sheet_resume' } },
      },
    ]);
  });

  it('waits for the receipt write and uses its persisted parent id', async () => {
    const runs: unknown[] = [];
    let finish!: (id: string) => void;
    const runtime = { getState: () => ({ messages: [{ id: 'optimistic-note' }] }), startRun: (config: unknown) => runs.push(config) };
    const pending = resumeIfNeeded(runtime as never, 'Change not applied', () => new Promise<string>((resolve) => { finish = resolve; }));
    expect(runs).toEqual([]);
    finish('persisted-note');
    await pending;
    expect(runs).toEqual([{ parentId: 'persisted-note', sourceId: null, runConfig: { custom: { hostAction: 'prompt_sheet_resume' } } }]);
  });

  it('does not resume after a failed receipt write or a conversation switch', async () => {
    const runs: unknown[] = [];
    const runtime = { getState: () => ({ messages: [] }), startRun: (config: unknown) => runs.push(config) };
    await resumeIfNeeded(runtime as never, 'Change not applied', async () => null);
    await resumeIfNeeded(runtime as never, 'Change not applied', async () => 'persisted-note', () => false);
    expect(runs).toEqual([]);
  });

  it('parses a natural residual bullet list' , () => {
    const raw = [
      '[PROMPT_SHEET]',
      'You confirmed a few changes',
      '• File content as Salaries will be paid early',
      '• Delete entry Salaries will be paid early',
    ].join('\n');
    expect(isPromptSheetResume(raw)).toBe(true);
    const view = parsePromptSheetResume(raw);
    expect(view.title).toBe('You confirmed a few changes');
    expect(view.items).toEqual([
      'File content as Salaries will be paid early',
      'Delete entry Salaries will be paid early',
    ]);
    expect(view.footer).toBeNull();
  });

  it('softens robotic legacy titles and Approved bullets', () => {
    const raw = [
      '[PROMPT_SHEET]',
      'Prompt resolved',
      '• Approved — Create entry "2025 Prius" in Cars',
    ].join('\n');
    expect(parsePromptSheetResume(raw)).toEqual({
      title: 'Updates applied',
      items: ['Create entry "2025 Prius" in Cars'],
      footer: null,
    });
  });

  it('parses legacy semicolon paragraphs', () => {
    const raw =
      '[PROMPT_SHEET]\nResolved prompts: approved "A"; approved "B". Please continue.';
    const view = parsePromptSheetResume(raw);
    expect(view.title).toBe('You confirmed a few changes');
    expect(view.items.length).toBe(2);
    expect(view.footer).toBeNull();
  });

  it('hides host continuation instructions from the visible transcript', () => {
    const raw = [
      '[PROMPT_SHEET]',
      'Updates applied',
      '• Create entry "2025 Prius" in Cars',
      '<!-- INTEGRAL_AGENT_DIRECTIVE',
      'Read the record before continuing. Do not repeat the write.',
      '-->',
    ].join('\n');
    expect(parsePromptSheetResume(raw)).toEqual({
      title: 'Updates applied',
      items: ['Create entry "2025 Prius" in Cars'],
      footer: null,
    });
  });

  it('hides the legacy unbounded continuation instruction', () => {
    const raw = [
      '[PROMPT_SHEET]',
      'Prompt resolved',
      '• Approved — Create entry "2025 Prius" in Cars',
      'The approved writes above have already been applied. Do not repeat the write.',
    ].join('\n');
    expect(parsePromptSheetResume(raw)).toEqual({
      title: 'Updates applied',
      items: ['Create entry "2025 Prius" in Cars'],
      footer: null,
    });
  });

  it('leaves ordinary user text alone', () => {
    expect(isPromptSheetResume('hello')).toBe(false);
    expect(promptSheetResumeDisplay('hello')).toBe('hello');
  });
});
