import MyReaderCore from "@/modules/my-reader-core"
import type {
  CoreAsyncDomain,
  CoreAsyncInput,
  CoreAsyncOperation,
  CoreAsyncOutput,
  CoreSyncDomain,
  CoreSyncInput,
  CoreSyncOperation,
  CoreSyncOutput,
} from "./contract.generated"
import { CORE_CONTRACT_VERSION } from "./contract.generated"

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
  input: unknown,
): string {
  const nativeVersion = MyReaderCore.coreContractVersion()
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

export function invokeCoreSync<
  Domain extends CoreSyncDomain,
  Operation extends CoreSyncOperation<Domain>,
>(
  domain: Domain,
  operation: Operation,
  input: CoreSyncInput<Domain, Operation>,
): CoreSyncOutput<Domain, Operation> {
  return outputFrom<CoreSyncOutput<Domain, Operation>>(
    MyReaderCore.invokeCoreSync(requestJson(domain, operation, input)),
    domain,
    operation,
  )
}

export async function invokeCoreAsync<
  Domain extends CoreAsyncDomain,
  Operation extends CoreAsyncOperation<Domain>,
>(
  domain: Domain,
  operation: Operation,
  input: CoreAsyncInput<Domain, Operation>,
): Promise<CoreAsyncOutput<Domain, Operation>> {
  return outputFrom<CoreAsyncOutput<Domain, Operation>>(
    await MyReaderCore.invokeCoreAsync(requestJson(domain, operation, input)),
    domain,
    operation,
  )
}
