import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContributionLifecycleContext } from '../contributionLifecycle';
import { RelatedRecordControl } from '../RelatedRecordControl';
import { extensionsApi } from '../../../api/extensions';
import { entriesApi } from '../../../api';

const identity = vi.hoisted(() => ({
  principalId: 'reviewer',
  workspaceId: 'workspace',
}));
vi.mock('../../../context/AuthContext', () => ({
  useAuthOptional: () => ({ user: { id: identity.principalId } }),
}));
vi.mock('../../../context/ScopeContext', () => ({
  useScopeOptional: () => ({ scope: { workspaceId: identity.workspaceId } }),
}));

vi.mock('../../../api', () => ({ entriesApi: { get: vi.fn() } }));
vi.mock('../../../api/extensions', () => ({
  extensionsApi: { listOperations: vi.fn(), invokeOperation: vi.fn() },
  requireOperationOutput: (value: unknown) => value,
}));

const config = {
  kind: 'contact',
  form_operation: 'contact_form',
  create_operation: 'create_contact',
  prefill: { email: 'recipient' },
};
const form = {
  output: {
    fields: [{ key: 'name', name: 'Name', type: 'text', required: true }],
    defaults: {},
  },
};
type HarnessProps = {
  appId?: string;
  trackId?: string;
  entryId?: string;
  mode?: 'create' | 'edit';
  onPatch?: (entryId: string, patch: unknown) => void;
};
function Harness({
  appId = 'app-1',
  trackId = 'track-1',
  entryId = 'parent-1',
  mode = 'create',
  onPatch,
}: HarnessProps) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );
  const [fields, setFields] = useState<Record<string, unknown>>({
    note: 'Keep my draft',
    recipient: 'my-edited@example.invalid',
  });
  return (
    <QueryClientProvider client={client}>
      <ContributionLifecycleContext.Provider
        value={{
          appId,
          trackId,
          entryId,
          mode,
          placement: 'entry_compose',
          customFields: fields,
          register: () => () => {},
          onDraftPatch: (patch) => {
            onPatch?.(entryId, patch);
            setFields((prev) => ({ ...prev, ...patch.custom_fields }));
          },
        }}
      >
        <input
          aria-label="Existing note"
          value={String(fields.note)}
          onChange={(event) =>
            setFields((prev) => ({ ...prev, note: event.target.value }))
          }
        />
        <output data-testid="draft">{JSON.stringify(fields)}</output>
        <RelatedRecordControl
          config={config}
          props={{
            field: {
              key: 'contact',
              name: 'Contact',
              type: 'relation',
              validation: { write_label_to: 'contact_name' },
            },
            value: fields.contact,
            onChange: (id) => setFields((prev) => ({ ...prev, contact: id })),
          }}
          renderField={(props) => (
            <input
              aria-label={props.field.name}
              value={String(props.value || '')}
              onChange={(event) => props.onChange(event.target.value)}
            />
          )}
        />
      </ContributionLifecycleContext.Provider>
    </QueryClientProvider>
  );
}
beforeEach(() => {
  identity.principalId = 'reviewer';
  identity.workspaceId = 'workspace';
  sessionStorage.clear();
  let nextIntent = 0;
  vi.stubGlobal('crypto', {
    randomUUID: () => `synthetic-intent-${++nextIntent}`,
    subtle: { digest: async () => new Uint8Array([1, 2, 3]).buffer },
  });
  vi.mocked(extensionsApi.listOperations).mockResolvedValue({
    operations: [{ key: 'create_contact', allowed: true }],
  });
  vi.mocked(extensionsApi.invokeOperation).mockImplementation(
    async (_app, operation) =>
      (operation === 'contact_form'
        ? form
        : { output: { ok: true, entry_id: 'entry-1' } }) as never
  );
  vi.mocked(entriesApi.get).mockResolvedValue({
    id: 'entry-1',
    title: 'New contact',
    custom_fields: { email: 'source@example.invalid' },
  } as never);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
async function open() {
  render(<Harness />);
  fireEvent.click(await screen.findByRole('button', { name: 'Add contact' }));
  await screen.findByLabelText('Name');
}

describe('related record creation', () => {
  it('preserves the original draft and edited defaults, verifies and selects the saved record', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'New contact' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save and use' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(entriesApi.get).toHaveBeenCalledWith('entry-1');
    expect(screen.getByLabelText('Existing note')).toHaveValue('Keep my draft');
    expect(JSON.parse(screen.getByTestId('draft').textContent!)).toMatchObject({
      contact: 'entry-1',
      contact_name: 'New contact',
      recipient: 'my-edited@example.invalid',
    });
  });

  it('cancels without saving or changing the original draft', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Unsaved contact' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(extensionsApi.invokeOperation).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Existing note')).toHaveValue('Keep my draft');
  });

  it('asks before replacing existing details with the selected record defaults', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'New contact' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save and use' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByText('Review selected contact details'));
    expect(
      screen.getByText(/Current: my-edited@example.invalid/)
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Use selected details' })
    );
    expect(JSON.parse(screen.getByTestId('draft').textContent!)).toMatchObject({
      recipient: 'source@example.invalid',
      note: 'Keep my draft',
    });
  });

  it('hides creation when the operation is denied', async () => {
    vi.mocked(extensionsApi.listOperations).mockResolvedValue({
      operations: [{ key: 'create_contact', allowed: false }],
    });
    render(<Harness />);
    await waitFor(() =>
      expect(extensionsApi.listOperations).toHaveBeenCalled()
    );
    expect(screen.queryByRole('button', { name: 'Add contact' })).toBeNull();
  });

  it.each(['write', 'readback'])(
    'retains exact command identity after an uncertain %s',
    async (failure) => {
      let attempts = 0;
      vi.mocked(extensionsApi.invokeOperation).mockImplementation(
        async (_app, operation) => {
          if (operation === 'contact_form') return form as never;
          if (++attempts === 1 && failure === 'write')
            throw new Error('Network lost');
          return { output: { ok: true, entry_id: 'entry-1' } } as never;
        }
      );
      if (failure === 'readback')
        vi.mocked(entriesApi.get).mockRejectedValueOnce({
          response: { status: 503 },
        });
      await open();
      fireEvent.change(screen.getByLabelText('Name'), {
        target: { value: 'Retry contact' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save and use' }));
      const retry = await screen.findByRole('button', {
        name: 'Check saved result',
      });
      expect(screen.getByLabelText('Name')).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
      expect(
        screen.queryByRole('button', { name: 'Start a new record' })
      ).toBeNull();
      fireEvent.click(retry);
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      const writes = vi
        .mocked(extensionsApi.invokeOperation)
        .mock.calls.filter((call) => call[1] === 'create_contact');
      expect(writes).toHaveLength(2);
      expect(writes[1]).toEqual(writes[0]);
    }
  );

  it('requires explicit duplicate review before creating a separate identity', async () => {
    vi.mocked(extensionsApi.invokeOperation).mockImplementation(
      async (_app, operation) =>
        operation === 'contact_form'
          ? (form as never)
          : ({
              output: {
                ok: false,
                message: 'Similar contact',
                candidates: [{ id: 'existing', title: 'Existing contact' }],
              },
            } as never)
    );
    await open();
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Similar contact' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save and use' }));
    await screen.findByRole('button', { name: 'Existing contact' });
    expect(screen.getByRole('button', { name: 'Save and use' })).toBeDisabled();
    fireEvent.click(
      screen.getByLabelText('Create a separate record with these details')
    );
    expect(screen.getByRole('button', { name: 'Save and use' })).toBeEnabled();
  });

  it.each([
    ['parent entry', { entryId: 'parent-2' }],
    ['track', { trackId: 'track-2' }],
    ['App', { appId: 'app-2' }],
    ['mode', { mode: 'edit' as const }],
    ['principal', {}],
    ['workspace', {}],
  ])(
    'discards a pending created-record read when the %s changes',
    async (boundary, nextProps) => {
      let finishRead!: (
        entry: Awaited<ReturnType<typeof entriesApi.get>>
      ) => void;
      vi.mocked(entriesApi.get).mockReturnValueOnce(
        new Promise((resolve) => {
          finishRead = resolve;
        })
      );
      const onPatch = vi.fn();
      const view = render(<Harness onPatch={onPatch} />);
      fireEvent.click(
        await screen.findByRole('button', { name: 'Add contact' })
      );
      await screen.findByLabelText('Name');
      fireEvent.change(screen.getByLabelText('Name'), {
        target: { value: 'For the first parent' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save and use' }));
      await waitFor(() =>
        expect(entriesApi.get).toHaveBeenCalledWith('entry-1')
      );

      if (boundary === 'principal') identity.principalId = 'other-user';
      if (boundary === 'workspace') identity.workspaceId = 'other-workspace';
      view.rerender(<Harness {...nextProps} onPatch={onPatch} />);
      await act(async () =>
        finishRead({
          id: 'entry-1',
          title: 'Old result',
          custom_fields: { email: 'old@example.invalid' },
        } as never)
      );

      expect(onPatch).not.toHaveBeenCalled();
      expect(
        JSON.parse(screen.getByTestId('draft').textContent!)
      ).not.toHaveProperty('contact');
      expect(screen.queryByRole('dialog')).toBeNull();
    }
  );

  it('discards a pending create response after changing the parent', async () => {
    let finishCreate!: (
      response: Awaited<ReturnType<typeof extensionsApi.invokeOperation>>
    ) => void;
    vi.mocked(extensionsApi.invokeOperation).mockImplementation(
      async (_app, operation) =>
        operation === 'contact_form'
          ? (form as never)
          : new Promise((resolve) => {
              finishCreate = resolve;
            })
    );
    const onPatch = vi.fn();
    const view = render(<Harness onPatch={onPatch} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add contact' }));
    await screen.findByLabelText('Name');
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Old parent' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save and use' }));
    await waitFor(() => expect(finishCreate).toBeTypeOf('function'));
    view.rerender(<Harness entryId="parent-2" onPatch={onPatch} />);
    await act(async () =>
      finishCreate({ output: { ok: true, entry_id: 'entry-1' } } as never)
    );
    expect(entriesApi.get).not.toHaveBeenCalled();
    expect(onPatch).not.toHaveBeenCalled();
  });

  it('partitions stored recovery identities by parent and recovers the original parent intent', async () => {
    let writes = 0;
    vi.mocked(extensionsApi.invokeOperation).mockImplementation(
      async (_app, operation) => {
        if (operation === 'contact_form') return form as never;
        if (++writes === 1) throw new Error('Unknown completion');
        return { output: { ok: true, entry_id: 'entry-1' } } as never;
      }
    );
    const view = render(<Harness />);
    const submit = async () => {
      fireEvent.click(
        await screen.findByRole('button', { name: 'Add contact' })
      );
      await screen.findByLabelText('Name');
      fireEvent.change(screen.getByLabelText('Name'), {
        target: { value: 'Same contact details' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save and use' }));
    };
    await submit();
    await screen.findByRole('button', { name: 'Check saved result' });
    view.rerender(<Harness entryId="parent-2" />);
    await submit();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    view.rerender(<Harness />);
    await submit();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const commands = vi
      .mocked(extensionsApi.invokeOperation)
      .mock.calls.filter((call) => call[1] === 'create_contact');
    expect(commands).toHaveLength(3);
    expect(commands[1][3]).not.toBe(commands[0][3]);
    expect(commands[2]).toEqual(commands[0]);
    expect(sessionStorage.length).toBe(0);
  });

  it.each(['withheld output', 'denied readback'])(
    'retains %s across reopen and starts a fresh intent only on acknowledgement',
    async (failure) => {
      let writes = 0;
      vi.mocked(extensionsApi.invokeOperation).mockImplementation(
        async (_app, operation) => {
          if (operation === 'contact_form') return form as never;
          if (++writes === 1 && failure === 'withheld output')
            return { output_disposition: 'withheld' } as never;
          return { output: { ok: true, entry_id: 'entry-1' } } as never;
        }
      );
      if (failure === 'denied readback')
        vi.mocked(entriesApi.get).mockRejectedValueOnce({
          response: { status: 403 },
        });
      await open();
      fireEvent.change(screen.getByLabelText('Name'), {
        target: { value: 'Alice' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save and use' }));
      await screen.findByRole('button', { name: 'Start a new record' });
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      fireEvent.click(
        await screen.findByRole('button', { name: 'Add contact' })
      );
      expect(screen.getByLabelText('Name')).toHaveValue('Alice');
      expect(screen.getByLabelText('Name')).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'Save and use' })
      ).toBeDisabled();

      fireEvent.click(
        screen.getByRole('button', { name: 'Start a new record' })
      );
      expect(screen.getByLabelText('Name')).toHaveValue('');
      expect(screen.getByLabelText('Name')).toBeEnabled();
      expect(
        vi
          .mocked(extensionsApi.invokeOperation)
          .mock.calls.filter((call) => call[1] === 'create_contact')
      ).toHaveLength(1);
      fireEvent.change(screen.getByLabelText('Name'), {
        target: { value: 'Bob' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save and use' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      const commands = vi
        .mocked(extensionsApi.invokeOperation)
        .mock.calls.filter((call) => call[1] === 'create_contact');
      expect(commands).toHaveLength(2);
      expect(commands[0][2]).toMatchObject({ fields: { name: 'Alice' } });
      expect(commands[1][2]).toMatchObject({ fields: { name: 'Bob' } });
      expect(commands[1][3]).not.toBe(commands[0][3]);
    }
  );
});
