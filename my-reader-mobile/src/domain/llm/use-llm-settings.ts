import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  getLlmConfig,
  upsertLlmProfile,
  removeLlmProfile,
  selectLlmProfile,
  listLlmModels,
  probeLlmProfile,
  type LlmProfileInput,
} from "@/src/services/core/llm"

const key = ["llm-settings"]
export function useLlmSettings() {
  const client = useQueryClient()
  const query = useQuery({ queryKey: key, queryFn: getLlmConfig })
  const save = useMutation({
    mutationFn: upsertLlmProfile,
    onSuccess: (data) => client.setQueryData(key, data),
  })
  const remove = useMutation({
    mutationFn: removeLlmProfile,
    onSuccess: (data) => client.setQueryData(key, data),
  })
  const select = useMutation({
    mutationFn: selectLlmProfile,
    onSuccess: (data) => client.setQueryData(key, data),
  })
  const models = useMutation({
    mutationFn: (input: LlmProfileInput) => listLlmModels(input),
  })
  const probe = useMutation({
    mutationFn: (input: LlmProfileInput) => probeLlmProfile(input),
  })
  const error =
    save.error ??
    remove.error ??
    select.error ??
    query.error ??
    models.error ??
    probe.error
  return { query, save, remove, select, models, probe, error }
}
