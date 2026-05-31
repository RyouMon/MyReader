import i18n from "@/src/i18n";

export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** WebDAV 数据源缺失、密码未配置、本地书库根目录无法解析等配置问题，用户需要去设置里修复。 */
export class SyncConfigError extends AppError {}

/** 远程书库连通性检查失败；携带 sync report 供 UI 展示。 */
export class SyncConnectivityError extends AppError {
  constructor(
    message: string,
    public readonly report: import("../domain/sync/types").LibrarySyncReport,
  ) {
    super(message);
  }
}

/** 网络请求失败，通常是临时问题，可以重试。 */
export class NetworkError extends AppError {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
  }
}

/** 文件损坏、哈希不匹配、下载后文件缺失等数据完整性问题，需要重新下载。 */
export class DataIntegrityError extends AppError {}

/** 内部逻辑断言失败，属于代码 bug，不应在正常流程中出现。 */
export class AppInvariantError extends AppError {}

/** 数据源正在被书库使用，无法删除。 */
export class DataSourceInUseError extends AppError {
  constructor(
    message: string,
    public readonly libraryNames: string[],
  ) {
    super(message);
  }
}

type DownloadErrorInfo = { title: string; message: string };

const CONNECTIVITY_ERROR_INFO: DownloadErrorInfo = {
  title: i18n.t("errors.sourceUnreachable"),
  message:
    i18n.t("errors.sourceUnreachableDetail"),
};

/**
 * Converts an unknown download error into a user-friendly title + message pair
 * suitable for Alert.alert / showAlertWithStatusBarRestore.
 *
 * Connectivity timeouts (NetworkError without an HTTP status code) get a
 * dedicated message that lists the likely causes. All other errors fall back to
 * showing the raw message under a generic title.
 */
export function describeDownloadError(err: unknown): DownloadErrorInfo {
  if (err instanceof NetworkError && err.statusCode === undefined) {
    return CONNECTIVITY_ERROR_INFO;
  }
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes(i18n.t("errors.timeout")) || /network request failed/i.test(message)) {
    return CONNECTIVITY_ERROR_INFO;
  }
  return { title: i18n.t("errors.downloadFailed"), message };
}
