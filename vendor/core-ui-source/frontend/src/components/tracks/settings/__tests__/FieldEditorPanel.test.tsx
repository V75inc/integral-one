import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FieldEditorPanel } from '../FieldEditorPanel';

describe('FieldEditorPanel', () => {
  it('create mode: auto-slugs key from name, disables Save when name empty', () => {
    const onSave = vi.fn();
    render(
      <FieldEditorPanel
        open
        mode="create"
        siblingKeys={[]}
        initial={null}
        onSave={onSave}
        onCancel={() => {}}
      />
    );
    const nameInput = screen.getByLabelText(/^Name/i) as HTMLInputElement;
    const keyInput = screen.getByLabelText(/^Key/i) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Project Owner' } });
    expect(keyInput.value).toBe('project_owner');
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      key: 'project_owner',
      name: 'Project Owner',
      type: 'text',
      id: expect.stringMatching(/^field-/),
    }));
  });

  it('edit mode: key + type inputs are disabled', () => {
    render(
      <FieldEditorPanel
        open
        mode="edit"
        siblingKeys={['priority', 'owner']}
        initial={{ key: 'owner', name: 'owner', type: 'text', required: false, order: 1 }}
        onSave={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByLabelText(/^Key/i)).toBeDisabled();
    expect(screen.getByLabelText(/^Type/i)).toBeDisabled();
  });

  it('edit mode preserves the field identity', () => {
    const onSave = vi.fn();
    render(
      <FieldEditorPanel
        open
        mode="edit"
        siblingKeys={['owner']}
        initial={{ id: 'fld-owner', key: 'owner', name: 'Owner', type: 'text' }}
        onSave={onSave}
        onCancel={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: 'fld-owner' }));
  });

  it('blocks Save when key duplicates a sibling', () => {
    const onSave = vi.fn();
    render(
      <FieldEditorPanel
        open
        mode="create"
        siblingKeys={['priority']}
        initial={null}
        onSave={onSave}
        onCancel={() => {}}
      />
    );
    fireEvent.change(screen.getByLabelText(/^Name/i), { target: { value: 'priority' } });
    expect(screen.getByText(/already exists/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('select type: blocks Save with zero options', () => {
    const onSave = vi.fn();
    render(
      <FieldEditorPanel
        open
        mode="create"
        siblingKeys={[]}
        initial={null}
        onSave={onSave}
        onCancel={() => {}}
      />
    );
    fireEvent.change(screen.getByLabelText(/^Name/i), { target: { value: 'Status' } });
    fireEvent.change(screen.getByLabelText(/^Type/i), { target: { value: 'select' } });
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
    expect(screen.getByText(/at least one option/i)).toBeInTheDocument();
  });
});
