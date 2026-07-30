import MyReaderRustComponents from "@/modules/myreader-rust-components"

const CORE_CONTRACT_VERSION = 1

type CoreInput = Record<string, unknown>

type CoreResponse<T> = {
  domain: string
  response: {
    operation: string
    output: T
  }
}

function requestJson(
  domain: string,
  operation: string,
  input: CoreInput,
): string {
  const nativeVersion = MyReaderRustComponents.coreContractVersion()
  if (nativeVersion !== CORE_CONTRACT_VERSION) {
    throw new Error(
      `CORE_CONTRACT_VERSION_MISMATCH: expected ${CORE_CONTRACT_VERSION}, received ${nativeVersion}`,
    )
  }
  return JSON.stringify({
    domain,
    request: {
      operation,
      input,
    },
  })
}

function outputFrom<T>(
  responseJson: string,
  domain: string,
  operation: string,
): T {
  const response = JSON.parse(responseJson) as CoreResponse<T>
  if (
    response.domain !== domain ||
    response.response?.operation !== operation
  ) {
    throw new Error("CORE_TRANSPORT_RESPONSE_MISMATCH")
  }
  return response.response.output
}

export function invokeCoreSync<T>(
  domain: string,
  operation: string,
  input: CoreInput,
): T {
  return outputFrom<T>(
    MyReaderRustComponents.invokeCoreSync(
      requestJson(domain, operation, input),
    ),
    domain,
    operation,
  )
}

export async function invokeCoreAsync<T>(
  domain: string,
  operation: string,
  input: CoreInput,
): Promise<T> {
  return outputFrom<T>(
    await MyReaderRustComponents.invokeCoreAsync(
      requestJson(domain, operation, input),
    ),
    domain,
    operation,
  )
}
