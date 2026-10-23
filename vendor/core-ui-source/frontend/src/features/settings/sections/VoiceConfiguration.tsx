import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mic } from "lucide-react";
import {
  voiceConfigurationApi,
  VOICE_CONFIGURATION_QUERY_KEY,
  type VoiceChoice,
  type ModelConnection,
} from "../../../api/aiConfiguration";
import { SPEECH_CONFIG_QUERY_ROOT } from "../../../api/speech";
import { useScopeOptional } from "../../../context/ScopeContext";
import { useAuthOptional } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { errorMessageFromAxios } from "../../../api/helpers";
import { Button } from "../../../components/ui/Button";
import { Modal } from "../../../components/ui";
import { Input, Select, Text } from "../../../ui";

export function VoiceConfiguration({
  connections,
  navigateToSection,
  embedded = false,
}: {
  connections: ModelConnection[];
  embedded?: boolean;
  navigateToSection?: (id: string) => void;
}) {
  const scope = useScopeOptional();
  const auth = useAuthOptional();
  const workspaceId = scope?.scope?.workspaceId;
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [draft, setDraft] = useState<
    (VoiceChoice & { revision: number }) | null
  >(null);
  useEffect(() => setDraft(null), [workspaceId, auth?.user?.id]);
  const query = useQuery({
    queryKey: [...VOICE_CONFIGURATION_QUERY_KEY, auth?.user?.id, workspaceId],
    queryFn: voiceConfigurationApi.get,
    enabled: !!auth?.user && !!workspaceId,
  });
  const save = useMutation({
    mutationFn: voiceConfigurationApi.save,
    onSuccess: () => {
      setDraft(null);
      void qc.invalidateQueries({ queryKey: VOICE_CONFIGURATION_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: SPEECH_CONFIG_QUERY_ROOT });
      showToast("Voice model saved.", "success");
    },
    onError: (error) =>
      showToast(
        errorMessageFromAxios(error, "Could not save voice model."),
        "error",
      ),
  });
  const providers = connections.filter((c) => c.provider === "openai");
  const data = query.data;
  return (
    <section
      className={embedded ? "" : "border-t border-[var(--border-subtle)] pt-5"}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          {!embedded && <Mic size={18} className="mt-1 shrink-0" />}
          <div className="min-w-0 space-y-1">
            <Text as={embedded ? "p" : "h3"} weight="medium">
              {embedded ? "Transcription model" : "Voice"}
            </Text>
            <Text as="p" variant="body-sm" tone="muted">
              Transcribes audio into text. Reuses a saved provider independently
              of your chat models.
            </Text>
            {data && (
              <Text as="p" variant="body-sm" className="break-words">
                {data.effective_model || "Browser recognition when available"}
              </Text>
            )}
            {query.isError && (
              <Text as="p" variant="body-sm" tone="muted">
                Voice model settings could not be loaded.{" "}
                <button
                  className="underline"
                  onClick={() => void query.refetch()}
                >
                  Retry
                </button>
              </Text>
            )}
            {navigateToSection && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigateToSection("voice-input")}
              >
                Voice input preferences
              </Button>
            )}
          </div>
        </div>
        {data?.editable && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              setDraft({
                ...data.configuration,
                revision: data.revision,
              })
            }
          >
            Configure voice
          </Button>
        )}
      </div>
      <Modal
        open={!!draft}
        onClose={() => {
          if (!save.isPending) setDraft(null);
        }}
        title="Voice model"
        placement="right"
      >
        {draft && (
          <Modal.Body>
            <Text as="p" variant="body-sm" tone="muted">
              Choose a transcription model. Microphone, language and shortcut
              preferences stay under Voice input.
            </Text>
            <Text as="label" variant="body-sm" className="flex flex-col gap-1">
              Model source
              <Select
                value={draft.mode}
                disabled={save.isPending}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    mode: e.target.value as VoiceChoice["mode"],
                  })
                }
              >
                <option value="inherit">Current / deployment default</option>
                <option value="provider">Saved provider</option>
                <option value="disabled">Browser recognition only</option>
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
                    disabled={save.isPending}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        connection_id: e.target.value,
                        model: draft.model || "gpt-4o-mini-transcribe",
                      })
                    }
                  >
                    <option value="">Choose a saved OpenAI provider</option>
                    {providers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Text>
                {!providers.length && (
                  <Text as="p" variant="body-sm" tone="muted">
                    Add an OpenAI provider under Providers first. Voice
                    currently supports OpenAI transcription.
                  </Text>
                )}
                <Text
                  as="label"
                  variant="body-sm"
                  className="flex flex-col gap-1"
                >
                  Transcription model
                  <Input
                    list="voice-model-options"
                    value={draft.model}
                    disabled={save.isPending}
                    onChange={(e) =>
                      setDraft({ ...draft, model: e.target.value })
                    }
                  />
                  <datalist id="voice-model-options">
                    <option value="gpt-4o-mini-transcribe" />
                    <option value="gpt-4o-transcribe" />
                  </datalist>
                </Text>
                <Text as="p" variant="meta" tone="muted">
                  Audio is sent to the selected provider when you use provider
                  dictation.
                </Text>
              </>
            )}
            <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border-subtle)] pt-4">
              <Button
                variant="ghost"
                disabled={save.isPending}
                onClick={() => setDraft(null)}
              >
                Cancel
              </Button>
              <Button
                disabled={
                  save.isPending ||
                  (draft.mode === "provider" &&
                    (!draft.connection_id || !draft.model.trim()))
                }
                onClick={() => save.mutate(draft)}
              >
                {save.isPending ? "Saving…" : "Save voice model"}
              </Button>
            </div>
          </Modal.Body>
        )}
      </Modal>
    </section>
  );
}
