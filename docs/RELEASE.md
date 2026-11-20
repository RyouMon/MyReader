# MyReader 发布手册

1. 从最新的 `main` 创建 `release/<版本>`，例如 `release/0.23.1`。同步桌面和移动版本，更新中英文更新日志，向 `main` 开 MR。创建或更新 MR 会启动验证，正式标签要等到合并之后。
2. 在发布 Mac 的仓库目录运行 `pnpm release:local --pr <MR 编号>`。命令检查 MR 所属仓库、目标分支、版本和当前提交，在独立工作目录构建。Windows 流水线与本机可以同时工作。

   | 平台 | 构建位置 | 产物 |
   | --- | --- | --- |
   | Windows x64 | GitHub Actions | MSI、NSIS 安装程序 |
   | macOS | Mac | Apple Silicon、Intel 各一个 Developer ID 签名、公证并装订公证票据的 DMG |
   | Linux x64 | Mac 上的 Linux amd64 容器 | AppImage、DEB、RPM |
   | Android | Mac，EAS local | 使用生产签名的 APK 及 SHA-256 |
   | iOS | Mac | 分发 IPA，以及供 iPhone/iPad 测试的 Release simulator app |

3. Mac 汇集同一提交的 Windows 和本机产物，核验文件清单、大小和 SHA-256，上传到按 MR 编号和提交区分的 GitHub 草稿。候选清单记录 MR、提交、Git tree、版本和摘要。MR 上的 `QA`、`Unit tests`、`Changed-line coverage` 及候选上传校验均须通过。有人推送修复后，用原 MR 编号重跑命令，旧提交的候选包不能用于新提交。
4. 移动端和桌面端运行完整 E2E。将失败、跳过或缺少报告的平台、用例或日志位置和提交号贴到 MR，作为警告。审阅者根据实际产品风险决定是否修复。E2E 警告无需豁免或重新跑绿。
5. 审阅并合并 MR。发布工作流核对候选的提交和合并后的文件树，提交同一份 IPA 到 TestFlight，在实际合并提交上生成 `v<版本>`，验证上传文件的服务端摘要后公开 GitHub Release。IPA 用于 TestFlight，模拟器包用于诊断。已存在且指向其他提交的正式标签会阻止发布。

## 本机准备

候选草稿使用 `candidate-pr-<编号>-<完整提交号>` 作为草稿名称。正式版使用 `v<版本>`。同一提交重试时，本机构建缓存复用已经校验的产物。日志在 `~/Library/Caches/MyReader-release/pr-<编号>-<提交号>/`。

在这台 Mac 上登录 `gh` 和 EAS，确认账号可访问项目。EAS 本地构建使用该项目托管的 Android keystore、iOS 分发证书和 provisioning profile。TestFlight 提交使用项目的 App Store Connect 密钥。

在登录钥匙串导入带私钥的 Developer ID Application 证书。用开发者账号和 Team ID 运行下列命令，按系统提示输入 App 专用密码。已有公证配置可直接用第二条验证。

```sh
xcrun notarytool store-credentials MyReader-Notary --apple-id "开发者账号邮箱" --team-id "团队编号"
xcrun notarytool history --keychain-profile MyReader-Notary
```

Mac 需要 Xcode、CocoaPods、Fastlane、JDK 和 Android SDK/NDK、Rust 两种 macOS 架构目标、pnpm、Docker 及 Maestro。GitHub 仓库 Secrets 供 Actions 使用。本机 Expo 可使用已登录的账号或环境变量 `EXPO_TOKEN`。

## 失败和重试

质量检查、签名、公证、构建、文件缺失或摘要不符都需要处理。源码修复提交到同一个发布分支。上传失败时可重试同一提交的候选。合并后的发布重跑须复用经过验证的字节和合并提交。上一版的标签保持原指向。

移动设备和模拟器操作详见[移动 E2E 手册](../my-reader-mobile/e2e/README.md)。质量检查见[质量手册](./QUALITY.md)。
