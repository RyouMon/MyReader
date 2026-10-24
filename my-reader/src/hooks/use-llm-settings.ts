import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/tauri-api"
import type { LlmProfileInput } from "@/lib/tauri-specta"

const key = ["llm-settings"]
export function useLlmSettings() {
  const client = useQueryClient()
  const query = useQuery({ queryKey: key, queryFn: api.getLlmConfig })
  const save = useMutation({
    mutationFn: (input: LlmProfileInput) => api.upsertLlmProfile(input),
    onSuccess: (data) => client.setQueryData(key, data),
  })
  const remove = useMutation({
    mutationFn: api.removeLlmProfile,
    onSuccess: (data) => client.setQueryData(key, data),
  })
  const select = useMutation({
    mutationFn: api.selectLlmProfile,
    onSuccess: (data) => client.setQueryData(key, data),
  })
  const models = useMutation({ mutationFn: api.listLlmModels })
  const probe = useMutation({ mutationFn: api.probeLlmProfile })
  const error =
    save.error ??
    remove.error ??
    select.error ??
    query.error ??
    models.error ??
    probe.error
  return { query, save, remove, select, models, probe, error }
}
