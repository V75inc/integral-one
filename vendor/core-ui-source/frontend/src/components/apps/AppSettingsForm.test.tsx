/**
 * AppSettingsForm — widget dispatch + change event tests.
 *
 * Phase 10 Plan 10-05 (APP-SETTINGS-01). Covers each of the 9 widget kinds
 * rendering correctly + emitting onChange with the expected shape.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AppSettingsForm } from './AppSettingsForm';

describe('AppSettingsForm', () => {
  afterEach(() => cleanup());

  it('renders empty-schema fallback when no properties declared', () => {
    render(
      <AppSettingsForm
        schema={{ type: 'object', properties: {} }}
        value={{}}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByText('This App has no configurable settings.'),
    ).toBeInTheDocument();
  });

  it('dispatches text widget for string type', () => {
    const onChange = vi.fn();
    render(
      <AppSettingsForm
        schema={{
          type: 'object',
          properties: {
            title: { type: 'string', title: 'Title' },
          },
        }}
        value={{ title: 'hello' }}
        onChange={onChange}
      />,
    );
    const input = screen.getByTestId('widget-text-title') as HTMLInputElement;
    expect(input.value).toBe('hello');
    fireEvent.change(input, { target: { value: 'world' } });
    expect(onChange).toHaveBeenCalledWith({ title: 'world' });
  });

  it('dispatches password widget when ui:widget is secret', () => {
    const onChange = vi.fn();
    render(
      <AppSettingsForm
        schema={{
          type: 'object',
          properties: {
            api_key: { type: 'string', 'ui:widget': 'secret' },
          },
        }}
        value={{}}
        onChange={onChange}
      />,
    );
    const inp = screen.getByTestId('widget-password-api_key') as HTMLInputElement;
    expect(inp.type).toBe('password');
    fireEvent.change(inp, { target: { value: 're_abc' } });
    expect(onChange).toHaveBeenCalledWith({ api_key: 're_abc' });
  });

  it('dispatches textarea widget when ui:widget is textarea', () => {
    const onChange = vi.fn();
    render(
      <AppSettingsForm
        schema={{
          type: 'object',
          properties: {
            body: { type: 'string', 'ui:widget': 'textarea' },
          },
        }}
        value={{}}
        onChange={onChange}
      />,
    );
    const ta = screen.getByTestId('widget-textarea-body') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'multi\nline' } });
    expect(onChange).toHaveBeenCalledWith({ body: 'multi\nline' });
  });

  it('dispatches select widget when enum is present', () => {
    const onChange = vi.fn();
    render(
      <AppSettingsForm
        schema={{
          type: 'object',
          properties: {
            cadence: {
              type: 'string',
              enum: ['weekly', 'daily'],
              'ui:widget': 'select',
            },
          },
          required: ['cadence'],
        }}
        value={{ cadence: 'weekly' }}
        onChange={onChange}
      />,
    );
    const sel = screen.getByTestId('widget-select-cadence') as HTMLSelectElement;
    expect(sel.value).toBe('weekly');
    fireEvent.change(sel, { target: { value: 'daily' } });
    expect(onChange).toHaveBeenCalledWith({ cadence: 'daily' });
  });

  it('dispatches multi_select widget for array+enum items', () => {
    const onChange = vi.fn();
    render(
      <AppSettingsForm
        schema={{
          type: 'object',
          properties: {
            platforms: {
              type: 'array',
              items: { type: 'string', enum: ['ig', 'yt', 'x'] },
            },
          },
        }}
        value={{ platforms: ['ig'] }}
        onChange={onChange}
      />,
    );
    expect(screen.getByText('ig')).toBeInTheDocument();
    const addSelect = screen.getByTestId(
      'widget-multi_select-platforms-add',
    ) as HTMLSelectElement;
    fireEvent.change(addSelect, { target: { value: 'yt' } });
    expect(onChange).toHaveBeenCalledWith({ platforms: ['ig', 'yt'] });
  });

  it('dispatches boolean widget for boolean type', () => {
    const onChange = vi.fn();
    render(
      <AppSettingsForm
        schema={{
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
          },
        }}
        value={{ enabled: false }}
        onChange={onChange}
      />,
    );
    const cb = screen.getByTestId('widget-boolean-enabled') as HTMLInputElement;
    expect(cb.checked).toBe(false);
    fireEvent.click(cb);
    expect(onChange).toHaveBeenCalledWith({ enabled: true });
  });

  it('dispatches number widget for number type', () => {
    const onChange = vi.fn();
    render(
      <AppSettingsForm
        schema={{
          type: 'object',
          properties: {
            limit: { type: 'number', minimum: 0, maximum: 100 },
          },
        }}
        value={{}}
        onChange={onChange}
      />,
    );
    const inp = screen.getByTestId('widget-number-limit') as HTMLInputElement;
    fireEvent.change(inp, { target: { value: '42' } });
    expect(onChange).toHaveBeenCalledWith({ limit: 42 });
  });

  it('dispatches date widget for format: date', () => {
    const onChange = vi.fn();
    render(
      <AppSettingsForm
        schema={{
          type: 'object',
          properties: {
            start: { type: 'string', format: 'date' },
          },
        }}
        value={{}}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open calendar' }));
    const dayButtons = screen.getAllByRole('gridcell');
    const day15 = dayButtons.find(
      el => el.getAttribute('aria-disabled') !== 'true' && el.textContent?.trim() === '15'
    );
    expect(day15).toBeTruthy();
    fireEvent.click(day15!.querySelector('button')!);
    expect(onChange).toHaveBeenCalled();
    const payload = onChange.mock.calls[0][0] as { start: string };
    expect(payload.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('dispatches entry_picker widget via ui:widget hint', () => {
    const onChange = vi.fn();
    render(
      <AppSettingsForm
        schema={{
          type: 'object',
          properties: {
            sources: {
              type: 'array',
              'ui:widget': 'entry_picker',
              'ui:filters': { track_key: 'source_material' },
            },
          },
        }}
        value={{ sources: [] }}
        onChange={onChange}
      />,
    );
    const inp = screen.getByTestId(
      'widget-entry_picker-sources-input',
    ) as HTMLInputElement;
    fireEvent.change(inp, { target: { value: 'entry-abc' } });
    fireEvent.keyDown(inp, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith({ sources: ['entry-abc'] });
    expect(screen.getByText(/track:source_material/)).toBeInTheDocument();
  });

  it('dispatches tag_picker widget via ui:widget hint', () => {
    const onChange = vi.fn();
    render(
      <AppSettingsForm
        schema={{
          type: 'object',
          properties: {
            tags: {
              type: 'array',
              'ui:widget': 'tag_picker',
            },
          },
        }}
        value={{ tags: ['voice:intro'] }}
        onChange={onChange}
      />,
    );
    expect(screen.getByText('voice:intro')).toBeInTheDocument();
    const inp = screen.getByTestId(
      'widget-tag_picker-tags-input',
    ) as HTMLInputElement;
    fireEvent.change(inp, { target: { value: 'new-tag' } });
    fireEvent.keyDown(inp, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith({
      tags: ['voice:intro', 'new-tag'],
    });
  });

  it('marks required fields with asterisk', () => {
    render(
      <AppSettingsForm
        schema={{
          type: 'object',
          properties: { x: { type: 'string', title: 'X' } },
          required: ['x'],
        }}
        value={{}}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('renders description below the field', () => {
    render(
      <AppSettingsForm
        schema={{
          type: 'object',
          properties: {
            x: { type: 'string', description: 'A helpful hint' },
          },
        }}
        value={{}}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('A helpful hint')).toBeInTheDocument();
  });
});
