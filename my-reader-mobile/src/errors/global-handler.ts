import { AppInvariantError } from "./app-errors"

type ErrorHandler = (error: Error, isFatal?: boolean) => void

interface RNErrorUtils {
  getGlobalHandler(): ErrorHandler
  setGlobalHandler(handler: ErrorHandler): void
}

// ErrorUtils 是 RN 运行时注入的全局对象，不通过模块 import 取得。
function getErrorUtils(): RNErrorUtils | null {
  return (
    ((globalThis as Record<string, unknown>).ErrorUtils as RNErrorUtils) ?? null
  )
}

let installed = false

/**
 * 注册全局 JS 异常兜底 handler。幂等，可多次调用。
 *
 * 须在 RN 运行时初始化后调用（组件首次渲染前），不能在模块初始化阶段调用。
 */
export function setupGlobalErrorHandler(): void {
  if (installed) return
  const errorUtils = getErrorUtils()
  if (!errorUtils) return
  installed = true

  const previousHandler = errorUtils.getGlobalHandler()
  errorUtils.setGlobalHandler((error, isFatal) => {
    if (error instanceof AppInvariantError) {
      console.error(
        "[AppError] 内部逻辑错误（请上报 bug）:",
        error.message,
        "\n",
        error.stack,
      )
    } else {
      console.error(`[AppError] 未捕获异常 isFatal=${isFatal}:`, error)
    }
    previousHandler?.(error, isFatal)
  })
}
