const provider = process.argv[2]
const baseUrl = process.env.TTS_FIXTURE_URL || "http://127.0.0.1:5050"

if (provider !== "openai") {
  process.stderr.write(
    "Usage: node e2e/scripts/assert-tts-fixture-requests.mjs openai\n",
  )
  process.exit(2)
}

const response = await fetch(`${baseUrl}/requests`)
if (!response.ok) {
  throw new Error(`Fixture request log returned HTTP ${response.status}`)
}

const requests = await response.json()
if (!Array.isArray(requests)) {
  throw new Error("Fixture request log is not an array")
}

const syntheses = requests.filter(
  (request) =>
    request.method === "POST" && request.path === "/openai/v1/audio/speech",
)
if (syntheses.length === 0) {
  throw new Error("No OpenAI-compatible synthesis request was recorded")
}
if (!(syntheses[0].generationMs > 20000)) {
  throw new Error("The cold synthesis request did not complete")
}
for (const request of syntheses) {
  if (
    request.authorized !== true ||
    typeof request.body?.input !== "string" ||
    typeof request.body?.model !== "string" ||
    typeof request.body?.voice !== "string" ||
    request.body?.response_format !== "mp3"
  ) {
    throw new Error("OpenAI-compatible synthesis request is malformed")
  }
}
if (
  !requests.some((request) => request.path === "/openai/v1/chat/completions") ||
  !syntheses.some(
    (request) =>
      request.body.instructions?.includes("Speak gently for Grace") &&
      request.generationMs > 0,
  )
) {
  throw new Error("Character analysis did not reach speech synthesis")
}
process.stdout.write(
  `Verified ${syntheses.length} OpenAI-compatible synthesis request(s), including character instructions.\n`,
)
