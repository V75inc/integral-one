import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  attachmentAnalysisApi,
  ATTACHMENT_ANALYSIS_QUERY_KEY,
} from "../../../api/aiConfiguration";
import { errorMessageFromAxios } from "../../../api/helpers";
import { useAuthOptional } from "../../../context/AuthContext";
import { useScopeOptional } from "../../../context/ScopeContext";
import { useToast } from "../../../context/ToastContext";
import { Select, Text } from "../../../ui";

export function AttachmentAnalysisConfiguration() {
  const auth = useAuthOptional();
  const scope = useScopeOptional();
  const workspaceId = scope?.scope?.workspaceId;
  const client = useQueryClient();
  const { showToast } = useToast();
  const query = useQuery({
    queryKey: [...ATTACHMENT_ANALYSIS_QUERY_KEY, auth?.user?.id, workspaceId],
    queryFn: attachmentAnalysisApi.get,
    enabled: !!auth?.user && !!workspaceId,
  });
  const save = useMutation({
    mutationFn: attachmentAnalysisApi.save,
    onSuccess: () => {
      void client.invalidateQueries({
        queryKey: ATTACHMENT_ANALYSIS_QUERY_KEY,
      });
      showToast("Image processing updated.", "success");
    },
    onError: (error) =>
      showToast(
        errorMessageFromAxios(error, "Could not update image processing."),
        "error",
      ),
  });
  const data = query.data;
  if (!data)
    return (
      <Text as="p" variant="body-sm" tone="muted">
        {query.isError
          ? "Image processing settings are unavailable."
          : "Loading image processing settings…"}
      </Text>
    );
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Text as="p" weight="medium">
          Search inside attachments
        </Text>
        <Text as="p" variant="body-sm" tone="muted">
          Document text, file details and visible image text join the search
          index in the background.
        </Text>
      </div>
      <label className="flex flex-col gap-2">
        <Text as="span" variant="body-sm">
          Image descriptions
        </Text>
        <Select
          aria-label="Image descriptions"
          value={data?.configuration.enabled ? "automatic" : "off"}
          disabled={!data?.editable || !data.available || save.isPending}
          onChange={(event) => {
            if (data)
              save.mutate({
                enabled: event.target.value === "automatic",
                revision: data.revision,
              });
          }}
        >
          <option value="automatic">
            Automatic · use a configured vision model
          </option>
          <option value="off">Off · file details only for images</option>
        </Select>
      </label>
      <Text as="p" variant="meta" tone="muted">
        Automatic descriptions send a resized image to your workspace’s
        configured vision-capable model. They capture visual details and
        readable text, labeled as AI-generated. Native document text extraction
        continues when image descriptions are off.
      </Text>
      {data && !data.available && (
        <Text as="p" variant="meta" tone="muted">
          Automatic descriptions are disabled by your deployment.
        </Text>
      )}
    </div>
  );
}
