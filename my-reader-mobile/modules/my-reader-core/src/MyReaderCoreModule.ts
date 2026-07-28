import { requireNativeModule } from "expo"

export type MyReaderCoreModule = {
  coreContractVersion(): number
  invokeCoreSync(requestJson: string): string
  invokeCoreAsync(requestJson: string): Promise<string>
}

let nativeModule: MyReaderCoreModule | null = null

function getNativeModule(): MyReaderCoreModule {
  nativeModule ??= requireNativeModule<MyReaderCoreModule>("MyReaderCore")
  return nativeModule
}

const moduleFacade: MyReaderCoreModule = {
  coreContractVersion() {
    return getNativeModule().coreContractVersion()
  },
  invokeCoreSync(requestJson) {
    return getNativeModule().invokeCoreSync(requestJson)
  },
  invokeCoreAsync(requestJson) {
    return getNativeModule().invokeCoreAsync(requestJson)
  },
}

export default moduleFacade
