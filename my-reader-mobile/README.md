# MyReader Mobile

MyReader 的 iOS / Android 客户端，基于 Expo 56、React Native 0.85 与 Expo Router。应用通过自有 Expo Modules 接入 Readium Swift / Kotlin Toolkit，并通过 UniFFI / JSI 使用共享 Rust Core。

本目录不是独立的 Create Expo App 模板。请先按仓库根目录的 [README](../README.md) 与 [开发指南](../docs/DEVELOPMENT.md) 安装整个 pnpm / Cargo workspace。

> [!IMPORTANT]
> MyReader 使用自定义原生模块，不能在 Expo Go 中运行。首次运行或原生依赖变化后需要重新构建 development client。

## 常用命令

从仓库根目录运行：

```bash
# 启动 Metro
pnpm dev:mobile

# 构建并运行 development client
pnpm --filter my-reader-mobile ios
pnpm --filter my-reader-mobile android

# 完整移动单元测试
pnpm --filter my-reader-mobile exec jest --runInBand

# 原生配置变化后重新生成工程
pnpm --filter my-reader-mobile expo prebuild --clean
```

修改 Rust / FFI 接口时还需重新生成对应平台绑定，命令见 [开发指南](../docs/DEVELOPMENT.md)。移动端模块边界见 [架构文档](../docs/ARCHITECTURE.md) 和 [.agents/rules/mobile.md](../.agents/rules/mobile.md)。
