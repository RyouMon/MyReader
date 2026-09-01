import http from "node:http"

const host = process.env.TTS_FIXTURE_HOST || "127.0.0.1"
const port = Number(process.env.TTS_FIXTURE_PORT || 5050)
const expectedOpenAiCredential = "fixture-openai-key"
const audio = Buffer.from(
  "SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAJQAAC0AAGRkgICAmJiYsLDMzMzk5OUBARkZGTExMU1NTWVlgYGBmZmZsbHNzc3l5eYCAhoaGjIyMk5OTmZmgoKCmpqasrLOzs7m5ucDAxsbGzMzM09PT2dng4ODm5ubs7PPz8/n5+f//AAAAAExhdmM2MC4zMQAAAAAAAAAAAAAAACQC4AAAAAAAAAtAj3J4TwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/+MYxAAM0LIwAH5SgVer2d+/fv37948ePHisePHjOr1er1er1er1Gch0CuKCmrSc6aSa74fDCBAgQIEEAMPDw9WMzMzMyqqq/+MYxAcM0LZIABsyRaAgICuXLly5cZGRKEkQQBVKTyFBYTEmvP9GYzLaWlpaWlqhQUFBQSCgoKCwlf//+Ls0SyDAECCZCeGA/+MYxA4NYKXgAAb8RMmYHRChlp/jGMYNIYHYQZgLAcGAiAyAgDxIBBC9fl///////////rX///iLKkeS0xiRRljZuYxhPCKm/+MYxBMKWKXoAAa8RLpxEmZ4GqYQIGhgTAClYAKnacy7WtYK///4AWDRAYWkwYDoBZgpAhGHWI+cKEa5pShxmGUCIYKIEJgS/+MYxCQNUKXgAAewSADBmYARpeLTx//////////66v//+TtBRGBQSYMMgFABEyAQh4wJJAQMBDBqiQCFCgBsYAGAJhAAORAB/+MYxCkNcKXgAAb+RIgTY7f//////////6r///biiEDAswkOMjHjPi04FeMUQVk7EaZTYwEHMREEABBogYEcLgFioBBeVI6p/+MYxC4NqKXYAAb8RP/////////8rf///iEgWfAIAAbeAYBAMTjsDOCgME5CTzK1EWsxhEHVMEQAnDAdwFEwEAA2Pnjm0BEL/+MYxDIPKKXUAK/wgP9L//////////yy///rrI4gISMWDzIjcyNsM26TAiwxgxRhcUMLRCcDAZgMcwAsBUBoA6JAC4sAUiwA/+MYxDAO+KXUAAb+RLI0z///////////K///0k6MiQIJzFSY0cyN+NT9VQwlQEdNO/IrTLFgNEwf0AeMDWAADAYwCswBUAzE/+MYxC8QGKXIAAb+REATDAAmMgBkx//////////yyv///YQUBsFgDBQFA0BUSAYfOIGcoUYKOHMmWoNYpjK4W6YJEB8GBCgP/+MYxCkPyKXMAK/ygOYCkApHdQc6JpAAoeK//////////8rV///rEi2phoUY8MmZIZoLsbd7mCGhoBkmTBwYpCFHGBrAZ5gI/+MYxCQPOKXQAAb+RGApAwAREgAYBAEoOAFi3s///////////yz///UfJAYkFQKIGShgdWnahJjjBBH6WkAcSgNxjDgTmFIB/+MYxCIOuKXQAAb8RBGCeBaYCoE4AAYFQCSAAK5//////////yv///hxk6eBfoKgHCoHJgJBHGDCQKZ+3rJkZjMmCwEAYEYH/+MYxCINYKXgAAewSCYCgDRoEGTRoXve//////////6V///3aTlAoEYQEmOEJlp4atDmHGO0b+nDRo3i4GFwDWYHoDwkAans/+MYxCcNQKXcAAb8RFpUASgNv//////////o///4DXwm+wpC4FMDlpTDUDAN5ljA0PAmDC3ArMEYBIwHQDzABAHLUKVsgy///+MYxC0NAKXkAAa8RP///////+n4YbOpEukAQDhABmQBAGAWOyYoXBphVi5mAgDgYAYFpgCAIA4AAaAHTwane//////////6/+MYxDQNEKXkAAH8QBX///iTIUbi2JkEmyofnZhVh3Gxw7QZuoWhhGATgYFoaAIUUUpXM0nN///4mwBStwFNzIDjfxzC+EoN/+MYxDoJ8KXoAAZ8RLjkcM9YOowpQRTBAAeMB0BUwBQBy0igbKMv/////////+j///irJkBoCCjCxowZBMNljAuIbMi3+0xK/+MYxE0NAKXkAAa8RIacwGQghwDMEAHBwABQAciyxa9//////////0r///gpfKCItSYwOaMYdBKYbYUhvbKsGiaDwYWwCJEE/+MYxFQNKKXgAAb8RBAoCQQAAJSrBMxz//////////6K///4bXYkWxQhAmKTG54mFoNcbUOdxnYCqGE+DWYIAGBgQgOmAWAS/+MYxFoMoKXkAAa8RAYAhBdYlr//////////pv//+WteTBLRGHHGIUmZzGCoMCZt9y5jwCWmB+CoYAgDaUinkuletOvV///3/+MYxGINcKXgAAa8RMFZR0AFAJjgYGpAuCYgoCByJCNAaiIWG4AwVZgQAEAQAgVADVkUb3//////////0v//+H2WJ9pciIAs/+MYxGcKGKXoAAa8RBgGRgQhDmEAPcafPXRlhDDGDmD2YFwGxgNgOmsoOYhWtS1//////////0X///dlQIAAJhYQY2RGUIZp/+MYxHkMuKXgAAa8RLJGGQQObkfq5n8DKmFGDsYGAE5bZUoOACL4qDWP/////////+n///bom+SAkEIQZDr57jhiShYnRUuK/+MYxIENaKXgAAewSGteEaYfQFRgygMmBYAwYAwCAJAHRAUPx//////////6Ff//+Ls0SyDAECCZCeGAyZgdEKGWn+MYxg0h/+MYxIYNQKXcAAb8RIHYQZgLAcGAiAyAgDxIBBC9fl///////////pX///fVW4KATBhDKljTLTo5DDWFxN5exs0OhHTCxBMM/+MYxIwNkKXcAAa8RA6APKAEk20EyYq5rH//////////Qv///jGBkMLLA/4LAANKRA8U4xDxSzl8oVNU8Qcw6gUjBhArMC4C/+MYxJANYKXgAAb8RANkjGcv4pXj//////////01///5O0FEYFBJgwyAUAETIBCHjAkkBAwEMGqJAIUKAGxgAYAmEAA5EAGI/+MYxJUM6KXgAAa8RBNjt///////////of//94VghADAIQypA1R07sIw8hAziBf9NL4MUwywKgcEiEAViMANBpNFaWH//////+MYxJwNmKXcAKewgP////0q///30XOl4y9KgwEQHzBCBkMMsYc3SrwTQRE1MLAGAwRwLTAiAcNSgEdFBYez//////////0V/+MYxKANcKXgAAb+RP//+LMFLtGDAJhg2YegGOSpgqkHGbV8sY74zhgeA+gEDARgFo1jwBKQS9b///////////Sq///4JYUg/+MYxKUM2KXgAAa8RMlujFgjRBTokDDeBhN+M200ZAQwULsLBEGAuACFQA0PFssK1TxOfpDw7RmDpgyT0IsFc3JCISDkRy8F/+MYxKwNWKXgAAewSAK3XZQ8ici7SyaAo3qbMGCgwQQzamw+BmcSl345FImPB0gAaFlIHpnrISTZB0x4CWIl0iOBHnEHkS7S/+MYxLENCKXgAAb8RDw3Pa5j2uo5J0TtNwlBJ0TkjVA0EjwkUOUrgczITooS8BzCemgXo5TYIqEybKTSuqwKkkqXLGW5pzm6/+MYxLcKaKXkAAa8RExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq/+MYxMgWKP40AGbMaaqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq/+MYxKoM4MI0ADPSZaqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
  "base64",
)
const requests = []

function respondJson(response, status, value) {
  const body = Buffer.from(JSON.stringify(value))
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": body.length,
  })
  response.end(body)
}

async function readJson(request) {
  const chunks = []
  let length = 0
  for await (const chunk of request) {
    length += chunk.length
    if (length > 64 * 1024) throw new Error("payload_too_large")
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}

function record(request, body) {
  requests.push({
    method: request.method,
    path: request.url,
    authorized: Boolean(request.headers.authorization),
    body,
  })
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/health") {
      respondJson(response, 200, { ok: true })
      return
    }
    if (request.method === "GET" && request.url === "/requests") {
      respondJson(response, 200, requests)
      return
    }
    if (request.method === "POST" && request.url === "/reset") {
      requests.length = 0
      respondJson(response, 200, { ok: true })
      return
    }
    if (
      request.method === "POST" &&
      (request.url === "/openai/v1/audio/speech" ||
        request.url === "/v1/audio/speech")
    ) {
      if (
        request.headers.authorization !== `Bearer ${expectedOpenAiCredential}`
      ) {
        respondJson(response, 401, { error: "invalid_fixture_credential" })
        return
      }
      const body = await readJson(request)
      if (
        typeof body.model !== "string" ||
        typeof body.voice !== "string" ||
        typeof body.input !== "string" ||
        body.response_format !== "mp3"
      ) {
        respondJson(response, 400, { error: "invalid_openai_request" })
        return
      }
      record(request, body)
      response.writeHead(200, {
        "content-type": "audio/mpeg",
        "content-length": audio.length,
      })
      response.end(audio)
      return
    }
    respondJson(response, 404, { error: "not_found" })
  } catch (error) {
    respondJson(response, 400, {
      error: error instanceof Error ? error.message : "invalid_request",
    })
  }
})

server.listen(port, host, () => {
  process.stdout.write(
    `TTS fixture server listening on http://${host}:${port}\n`,
  )
})

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
