import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database } from "lucide-react";
import {
  embeddingConfigurationApi,
  EMBEDDING_CONFIGURATION_QUERY_KEY,
  type EmbeddingChoice,
  type ModelConnection,
} from "../../../api/aiConfiguration";
import { PROVIDER_LABELS } from "../../../api/modelCredentials";
import { useScopeOptional } from "../../../context/ScopeContext";
import { useAuthOptional } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { errorMessageFromAxios } from "../../../api/helpers";
import { Button } from "../../../components/ui/Button";
import { Modal } from "../../../components/ui";
import { Input, Select, Text } from "../../../ui";

const fresh = (): EmbeddingChoice => ({
  mode: "deployment",
  connection_id: "",
  model: "",
  dimensions: 1536,
  allow_workspace_text: false,
});
const examples: Record<string, { model: string; dimensions: number }> = {
  openai: { model: "text-embedding-3-small", dimensions: 1536 },
  openrouter: { model: "openai/text-embedding-3-small", dimensions: 1536 },
  ollama_local: { model: "embeddinggemma", dimensions: 768 },
};

export function EmbeddingConfiguration({
  connections,
  embedded = false,
}: {
  connections: ModelConnection[];
  embedded?: boolean;
}) {
  const scope = useScopeOptional();
  const auth = useAuthOptional();
  const workspaceId = scope?.scope?.workspaceId;
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [draft, setDraft] = useState<
    (EmbeddingChoice & { revision: number }) | null
  >(null);
  useEffect(() => setDraft(null), [workspaceId, auth?.user?.id]);
  const query = useQuery({
    queryKey: [
      ...EMBEDDING_CONFIGURATION_QUERY_KEY,
      auth?.user?.id,
      workspaceId,
    ],
    queryFn: embeddingConfigurationApi.get,
    enabled: !!auth?.user && !!workspaceId,
    refetchInterval: 15000,
  });
  const save = useMutation({
    mutationFn: embeddingConfigurationApi.save,
    onSuccess: (result) => {
      setDraft(null);
      void qc.invalidateQueries({
        queryKey: EMBEDDING_CONFIGURATION_QUERY_KEY,
      });
      showToast(
        result.changed === false
          ? "Embedding model saved."
          : "Embedding model saved. Search indexing will rebuild in the background.",
        "success",
      );
    },
    onError: (error) =>
      showToast(
        errorMessageFromAxios(error, "Could not save embedding model."),
        "error",
      ),
  });
  const test = useMutation({
    mutationFn: embeddingConfigurationApi.test,
    onSuccess: (result) =>
      showToast(result.message, result.valid ? "success" : "error"),
    onError: (error) =>
      showToast(
        errorMessageFromAxios(error, "Embedding model test failed."),
        "error",
      ),
  });
  const supported = connections.filter((c) => c.provider !== "anthropic");
  const data = query.data;
  const busy = save.isPending || test.isPending;
  const valid =
    !!draft &&
    (draft.mode === "deployment" ||
      (!!draft.connection_id &&
        !!draft.model.trim() &&
        draft.allow_workspace_text &&
        Number.isInteger(draft.dimensions) &&
        draft.dimensions >= 16 &&
        draft.dimensions <= 2000));
  return (
    <section
      className={embedded ? "" : "border-t border-[var(--border-subtle)] pt-5"}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          {!embedded && <Database size={18} className="mt-1 shrink-0" />}
          <div className="min-w-0 space-y-1">
            <Text as={embedded ? "p" : "h3"} weight="medium">
              {embedded ? "Search model" : "Embeddings"}
            </Text>
            <Text as="p" variant="body-sm" tone="muted">
              Powers semantic search in this workspace. Separate from chat and
              voice.
            </Text>
            {data && (
              <Text as="p" variant="body-sm" className="break-words">
                {data.effective_provider === "local"
                  ? "Local default"
                  : PROVIDER_LABELS[
                      data.effective_provider as keyof typeof PROVIDER_LABELS
                    ] || "Provider unavailable"}{" "}
                · {data.effective_model} · {data.dimensions} dimensions
              </Text>
            )}
            {data?.rebuild_status && (
              <Text as="p" variant="meta" tone="muted">
                {data.rebuild_status === "queued"
                  ? "Rebuild queued. Results fill in as indexing completes."
                  : data.rebuild_status === "superseded"
                    ? "Earlier rebuild replaced by newer settings."
                    : "Rebuild in progress. Results may be incomplete."}
              </Text>
            )}
            {data?.error && (
              <Text as="p" variant="body-sm" tone="muted">
                {data.error}
              </Text>
            )}
            {query.isError && (
              <Text as="p" variant="body-sm" tone="muted">
                Embedding settings could not be loaded.{" "}
                <button
                  className="underline"
                  onClick={() => void query.refetch()}
                >
                  Retry
                </button>
              </Text>
            )}
            {data && !data.provider_overrides_supported && (
              <Text as="p" variant="meta" tone="muted">
                Provider embeddings require a PostgreSQL passage index. This
                installation uses its deployment default.
              </Text>
            )}
            {data && !data.editable && (
              <Text as="p" variant="meta" tone="muted">
                Managed by the workspace owner or deployment administrator.
              </Text>
            )}
          </div>
        </div>
        {data?.editable && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              setDraft({
                ...fresh(),
                ...data.configuration,
                revision: data.revision,
              })
            }
          >
            Configure embeddings
          </Button>
        )}
      </div>
      <Modal
        open={!!draft}
        onClose={() => {
          if (!busy) setDraft(null);
        }}
        title="Embedding model"
        placement="right"
      >
        {draft && (
          <Modal.Body>
            <Text as="p" variant="body-sm" tone="muted">
              Choose how search understands workspace text. The local default
              keeps embedding processing on this installation.
            </Text>
            <Text as="label" variant="body-sm" className="flex flex-col gap-1">
              Model source
              <Select
                value={draft.mode}
                disabled={busy}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    mode: e.target.value as EmbeddingChoice["mode"],
                  })
                }
              >
                <option value="deployment">Local / deployment default</option>
                <option
                  value="provider"
                  disabled={!data?.provider_overrides_supported}
                >
                  Saved provider
                </option>
              </Select>
            </Text>
            {draft.mode === "provider" && (
              <>
                <Text
                  as="label"
                  variant="body-sm"
                  className="flex flex-col gap-1"
                >
                  Provider
                  <Select
                    value={draft.connection_id}
                    disabled={busy}
                    onChange={(e) => {
                      const c = supported.find(
                        (item) => item.id === e.target.value,
                      );
                      const example = c && examples[c.provider];
                      setDraft({
                        ...draft,
                        connection_id: e.target.value,
                        model: example?.model || "",
                        dimensions: example?.dimensions || 768,
                        allow_workspace_text: false,
                      });
                    }}
                  >
                    <option value="">Choose a saved provider</option>
                    {supported.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · {PROVIDER_LABELS[c.provider]}
                      </option>
                    ))}
                  </Select>
                </Text>
                {!supported.length && (
                  <Text as="p" variant="body-sm" tone="muted">
                    Add a provider under Providers first. Anthropic does not
                    offer an embedding API.
                  </Text>
                )}
                <Text
                  as="label"
                  variant="body-sm"
                  className="flex flex-col gap-1"
                >
                  Embedding model ID
                  <Input
                    value={draft.model}
                    disabled={busy}
                    onChange={(e) =>
                      setDraft({ ...draft, model: e.target.value })
                    }
                    placeholder="e.g. text-embedding-3-small"
                  />
                </Text>
                <Text
                  as="label"
                  variant="body-sm"
                  className="flex flex-col gap-1"
                >
                  Vector dimensions
                  <Input
                    type="number"
                    min={16}
                    max={2000}
                    value={draft.dimensions || ""}
                    disabled={busy}
                    onChange={(e) =>
                      setDraft({ ...draft, dimensions: Number(e.target.value) })
                    }
                  />
                  <Text variant="meta" tone="muted">
                    Must match the model output. Supported range: 16–2,000.
                  </Text>
                </Text>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={draft.allow_workspace_text}
                    disabled={busy}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        allow_workspace_text: e.target.checked,
                      })
                    }
                    className="mt-1"
                  />
                  <Text variant="body-sm">
                    Allow indexed workspace text and search queries to be
                    processed by this provider. External services receive this
                    text.
                  </Text>
                </label>
              </>
            )}
            <Text as="p" variant="meta" tone="muted">
              Changing models rebuilds the search index in a separate vector
              space. Results may be incomplete until indexing catches up.
              Testing sends a sample phrase only.
            </Text>
            <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border-subtle)] pt-4">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setDraft(null)}
              >
                Cancel
              </Button>
              <Button
                variant="secondary"
                disabled={busy || !valid}
                onClick={() => {
                  const { revision: _revision, ...choice } = draft;
                  test.mutate(choice);
                }}
              >
                {test.isPending ? "Testing…" : "Test model"}
              </Button>
              <Button
                disabled={busy || !valid}
                onClick={() => save.mutate(draft)}
              >
                {save.isPending ? "Saving…" : "Save model"}
              </Button>
            </div>
          </Modal.Body>
        )}
      </Modal>
    </section>
  );
}
