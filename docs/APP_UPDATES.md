# 应用更新

Windows、macOS、Linux 和 Android 从本仓库的 GitHub Releases 检查正式版本。
iOS 继续通过 App Store 更新，不展示更新设置，也不会发起 Release 检查。

## 用户操作

- 桌面端：设置 → 关于 → 应用更新。
- Android：设置 → 应用更新。
- 默认启用自动检查，在应用运行期间每天最多检查一次；手动检查可以随时重试。
- 发现新版本后，将版本号和 Markdown 更新日志一起展示；没有新版本时只显示检查结果。
- 自动下载安装包默认关闭。启用后，在应用运行期间下载新版本，不会自动安装或重启。
- 桌面端下载完成后，点击“打开安装包所在目录”，手动运行安装程序。
  AppImage 用户自行替换现有文件，并按系统要求赋予执行权限。
- Android 下载完成后，点击“打开安装程序”，由系统完成权限提示和安装确认。
  首次使用可能需要允许 MyReader 安装未知应用。
- 下载状态与偏好保存在设备本地，不随书库同步。重启后会重新校验已下载的文件。
  中断的下载可以重新开始，不承诺应用被系统终止后的后台续传。

## Release 约定

更新源为公开的
[latest release API](https://docs.github.com/en/rest/releases/releases#get-the-latest-release)。
无需在客户端配置 GitHub Token。
版本采用语义化版本比较，忽略草稿、预发布、同版本和旧版本。
只有在安装包全部上传完成后，才应发布正式 Release。

| 平台 | 安装包 |
| --- | --- |
| macOS Apple Silicon | `MyReader_<version>_aarch64.dmg` |
| macOS Intel | `MyReader_<version>_x64.dmg` |
| Windows NSIS | `MyReader_<version>_x64-setup.exe` |
| Windows MSI | `MyReader_<version>_x64_en-US.msi` |
| Linux AppImage | `MyReader_<version>_amd64.AppImage` |
| Linux Debian | `MyReader_<version>_amd64.deb` |
| Linux RPM | `MyReader-<version>-1.x86_64.rpm` |
| Android | `MyReader-<version>-android.apk` |

桌面端根据运行架构及 Tauri 的 bundle type 选择安装包，保留 MSI/NSIS、
AppImage/DEB/RPM 的安装格式。开发环境未记录 bundle type 时，
Windows 默认 NSIS，Linux 默认 AppImage。缺少匹配的安装包时显示提示，不下载其他架构。

下载仅接受本仓库 Release 的 HTTPS 资产地址，并要求 GitHub 返回资产 SHA-256。
先写入临时文件，通过文件大小和 SHA-256 校验后才标记下载完成；
打开安装包前再次校验。系统仍负责安装权限和应用签名检查。

## 实现与验证

共享 Rust Core 负责版本选择、下载、校验、频率限制和持久化。
Tauri 和 Android 只适配设备路径、当前安装版本、界面生命周期和安装程序入口。
React Query 在检查或下载时读取进度；安装操作始终独立于自动检查与自动下载。

回归测试覆盖平台和包类型匹配、版本顺序、预发布过滤、默认偏好、
检查频率、错误重试、下载完整性、缓存恢复、防止重复下载、
手动安装边界，以及 iOS 不提供更新功能。
