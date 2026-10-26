import { useQuery } from "@tanstack/react-query";
import {
  aiConfigurationApi,
  AI_CONFIGURATION_QUERY_KEY,
} from "../../../api/aiConfiguration";
import { useAuthOptional } from "../../../context/AuthContext";
import { useScopeOptional } from "../../../context/ScopeContext";

export function useAIConfiguration() {
  const auth = useAuthOptional();
  const scope = useScopeOptional();
  return useQuery({
    queryKey: [
      ...AI_CONFIGURATION_QUERY_KEY,
      auth?.user?.id,
      scope?.scope?.workspaceId,
    ],
    queryFn: aiConfigurationApi.get,
    enabled: !!auth?.user && !!scope?.scope?.workspaceId,
  });
}
