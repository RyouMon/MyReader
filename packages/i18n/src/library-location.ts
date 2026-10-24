const problems = [
  "root_missing",
  "path_unavailable",
  "invalid_library",
  "identity_unknown",
  "identity_mismatch",
  "credential",
  "connectivity",
  "data_source",
  "busy",
  "changed",
  "managed",
  "save_failed",
] as const
export function libraryLocationProblemKey(problem?: string | null) {
  const known = problems.find((value) => value === problem) ?? "save_failed"
  return `libraryLocation.problems.${known}` as const
}
export function libraryLocationTitleKey(problem?: string | null) {
  if (problem === "root_missing") return "libraryLocation.missingTitle"
  if (problem === "path_unavailable") return "libraryLocation.unavailableTitle"
  return "libraryLocation.title"
}
