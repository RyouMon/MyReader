export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** WebDAV 数据源缺失、密码未配置、本地书库根目录无法解析等配置问题，用户需要去设置里修复。 */
export class SyncConfigError extends AppError {}

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

export type DownloadErrorInfo = { title: string; message: string };

const CONNECTIVITY_ERROR_INFO: DownloadErrorInfo = {
  title: "数据源无法连接",
  message:
    "无法访问 WebDAV 数据源，下载已取消。\n\n可能的原因：\n• 当前网络连接不可用或不稳定\n• WebDAV 服务器未运行或无法访问\n• 服务器地址、端口或认证配置有误",
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
  if (message.includes("超时") || /network request failed/i.test(message)) {
    return CONNECTIVITY_ERROR_INFO;
  }
  return { title: "下载失败", message };
}
