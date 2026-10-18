import { useMutation, useQueryClient } from '@tanstack/react-query';
import { entryTypesApi } from '../../../../api/entryTypes';
import {
  entryTypesForTrackQueryKey,
  trackAttachedOperationalModelQueryKey,
} from '../../../../queryKeys';
import type { EntryTypeNode, OperationalModelFieldSpec } from '../../../../types';
import { withOrderedFields } from '../schemaFieldOrder';

interface SaveFieldsVars {
  entryTypeId: string;
  fields: OperationalModelFieldSpec[];
}

export function useFieldEdit(trackId: string) {
  const queryClient = useQueryClient();
  const etKey = entryTypesForTrackQueryKey(trackId);
  const cpKey = trackAttachedOperationalModelQueryKey(trackId);

  const patchEntryTypeFields = (
    snapshot: EntryTypeNode[] | undefined,
    entryTypeId: string,
    fields: OperationalModelFieldSpec[]
  ): EntryTypeNode[] | undefined => {
    if (!snapshot) return snapshot;
    return snapshot.map(et =>
      et.id === entryTypeId
        ? { ...et, form_schema: withOrderedFields(et.form_schema, fields) }
        : et
    );
  };

  const mutation = useMutation<
    EntryTypeNode,
    Error,
    SaveFieldsVars,
    { snapshot: EntryTypeNode[] | undefined }
  >({
    mutationFn: async ({ entryTypeId, fields }) => {
      const snapshot = queryClient.getQueryData<EntryTypeNode[]>(etKey);
      const existing = snapshot?.find(et => et.id === entryTypeId);
      return entryTypesApi.update(entryTypeId, {
        form_schema: { ...withOrderedFields(existing?.form_schema, fields) },
      });
    },
    onMutate: async ({ entryTypeId, fields }) => {
      await queryClient.cancelQueries({ queryKey: etKey });
      const snapshot = queryClient.getQueryData<EntryTypeNode[]>(etKey);
      if (snapshot) {
        queryClient.setQueryData<EntryTypeNode[]>(
          etKey,
          patchEntryTypeFields(snapshot, entryTypeId, fields) ?? snapshot
        );
      }
      return { snapshot };
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(etKey, context.snapshot);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: etKey });
      queryClient.invalidateQueries({ queryKey: cpKey });
    },
  });

  const setFieldsOptimistic = (entryTypeId: string, fields: OperationalModelFieldSpec[]) => {
    const snapshot = queryClient.getQueryData<EntryTypeNode[]>(etKey);
    if (!snapshot) return;
    queryClient.setQueryData<EntryTypeNode[]>(
      etKey,
      patchEntryTypeFields(snapshot, entryTypeId, fields) ?? snapshot
    );
  };

  return {
    saveFields: (entryTypeId: string, fields: OperationalModelFieldSpec[]) =>
      mutation.mutateAsync({ entryTypeId, fields }),
    setFieldsOptimistic,
    isSaving: mutation.isPending,
    error: mutation.error,
  };
}
