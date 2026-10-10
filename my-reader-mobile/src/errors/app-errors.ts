export class AppError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = this.constructor.name
  }
}

/** WebDAV 数据源缺失、密码未配置、本地书库根目录无法解析等配置问题，用户需要去设置里修复。 */
export class SyncConfigError extends AppError {}

/** Core 的失败类别是恢复策略的依据，message 仅保留诊断信息。 */
export class SyncFailureError extends AppError {
  constructor(
    message: string,
    public readonly failureKind: import("../domain/sync/types").SyncFailureKind,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

/** 远程书库连通性检查失败；携带 sync report 供 UI 展示。 */
export class SyncConnectivityError extends SyncFailureError {
  constructor(
    message: string,
    public readonly report: import("../domain/sync/types").LibrarySyncReport,
  ) {
    super(message, "connectivity")
  }
}

export class CredentialError extends AppError {}

/** 网络请求失败，通常是临时问题，可以重试。 */
export class NetworkError extends AppError {
  constructor(
    message: string,
    public readonly statusCode?: number,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

/** 文件损坏、哈希不匹配或因果历史缺失等数据完整性问题，需要从可靠副本恢复。 */
export class DataIntegrityError extends AppError {}

/** 内部逻辑断言失败，属于代码 bug，不应在正常流程中出现。 */
export class AppInvariantError extends AppError {}

/** 数据源正在被书库使用，无法删除。 */
export class DataSourceInUseError extends AppError {
  constructor(
    message: string,
    public readonly libraryNames: string[],
  ) {
    super(message)
  }
}
