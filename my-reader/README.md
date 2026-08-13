# MyReader Desktop

MyReader 的 Tauri 2 桌面端，负责 React UI、桌面 Readium / PDF.js 适配、窗口与文件系统能力，以及到共享 Rust Core 的 Tauri IPC 边界。

本目录不是独立项目。请先按仓库根目录的 [README](../README.md) 与 [开发指南](../docs/DEVELOPMENT.md) 安装整个 pnpm / Cargo workspace。

## 常用命令

从仓库根目录运行：

```bash
# 启动 Tauri 应用
pnpm dev:desktop

# 桌面前端单元测试
pnpm --filter my-reader run test:unit

# Rust 测试
(cd my-reader/src-tauri && cargo test)

# 生产构建
pnpm --filter my-reader tauri build
```

桌面端的分层、IPC 与 Reader 边界见 [架构文档](../docs/ARCHITECTURE.md) 和 [.agents/rules/desktop.md](../.agents/rules/desktop.md)。
