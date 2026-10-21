import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TaggableComposer } from './TaggableComposer';
vi.mock('./ResourceTagPopover', () => ({
  prefetchTagResources: vi.fn(),
  ResourceTagPopover: () => null,
}));
beforeEach(() =>
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  ),
);
afterEach(() => vi.unstubAllGlobals());
function Composer() {
  const [value, setValue] = useState('');
  return (
    <TaggableComposer
      value={value}
      onChange={setValue}
      entityRefs={[]}
      onEntityRefsChange={() => {}}
      aria-label="Draft"
    />
  );
}
it('keeps plain pasted multiline text native and preserves an edit in the middle', () => {
  render(<Composer />);
  const input = screen.getByRole('textbox', {
    name: 'Draft',
  }) as HTMLTextAreaElement;
  act(() => input.focus());
  fireEvent.change(input, {
    target: {
      value: 'First line\nSecond line\nThird line',
      selectionStart: 11,
      selectionEnd: 11,
    },
  });
  expect(input).toHaveClass('taggable-composer-native');
  expect(document.querySelector('.taggable-composer-mirror')).toHaveAttribute(
    'hidden',
  );
  fireEvent.select(input, { target: { selectionStart: 11, selectionEnd: 11 } });
  fireEvent.change(input, {
    target: {
      value: 'First line\nUpdated second line\nThird line',
      selectionStart: 19,
      selectionEnd: 19,
    },
  });
  expect(input.selectionStart).toBe(19);
  expect(input.value).toContain('Updated second line');
});

it('preserves rich clipboard formatting as Markdown in the chat draft', () => {
  render(<Composer />);
  const input = screen.getByRole('textbox', { name: 'Draft' }) as HTMLTextAreaElement;
  act(() => input.focus());
  fireEvent.paste(input, {
    clipboardData: {
      getData: (type: string) => type === 'text/html'
        ? '<h2>Project update</h2><p><strong>Ready</strong> for review.</p><ul><li>First step</li><li><em>Second step</em></li></ul>'
        : 'Project update Ready for review. First step Second step',
    },
  });
  expect(input.value).toContain('## Project update');
  expect(input.value).toContain('**Ready** for review.');
  expect(input.value).toContain('- First step');
  expect(input.value).toContain('- *Second step*');
});

it('does not turn unsafe pasted links into Markdown links', () => {
  render(<Composer />);
  const input = screen.getByRole('textbox', { name: 'Draft' }) as HTMLTextAreaElement;
  fireEvent.paste(input, {
    clipboardData: {
      getData: (type: string) => type === 'text/html'
        ? '<p><a href="javascript:alert(1)">Open this</a></p>'
        : 'Open this',
    },
  });
  expect(input.value).not.toContain('javascript:');
  expect(input.value).toContain('Open this');
});

it('replaces the selected text without adding characters around the paste', () => {
  render(<Composer />);
  const input = screen.getByRole('textbox', { name: 'Draft' }) as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: 'BeforeOldAfter' } });
  input.setSelectionRange(6, 9);
  fireEvent.paste(input, {
    clipboardData: { getData: (type: string) => type === 'text/html' ? '<b>New</b>' : 'New' },
  });
  expect(input.value).toBe('Before**New**After');
});
