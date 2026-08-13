<div align="right"><a href="./CONTRIBUTING_EN.md">English</a></div>

# 参与贡献

感谢你愿意改进 MyReader。项目目前由个人维护，清晰、聚焦、容易验证的贡献最容易合入。

## 开始之前

- Bug、行为变更或较大的功能，请先开 [Issue](https://github.com/RyouMon/MyReader/issues) 说明场景、平台与预期结果。
- 小型文档修正可以直接提交 Pull Request。
- 路线图不等于承诺。涉及新格式、同步协议、数据模型或大型 UI 改版时，请先讨论设计。
- 不要在 Issue、日志、截图或测试夹具中提交真实书库、书籍、凭据、访问令牌或私人服务地址。

参与社区即表示同意遵守 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)。安全漏洞不要提交公开 Issue，请按 [SECURITY.md](./SECURITY.md) 报告。

## 开发环境

请先完成 [开发指南](../docs/DEVELOPMENT.md) 中的首次安装。仓库主要要求 Node.js 22+、pnpm 11.7.0 与 Rust stable；移动原生开发另需 Xcode 16+ 或 Android Studio / Android SDK。

## 修改原则

- 保持改动小而明确，不顺手重构无关代码。
- 尊重 [架构文档](../docs/ARCHITECTURE.md) 与各包分层；平台 adapter 不重复实现 core 已拥有的业务规则。
- Calibre `metadata.db` 始终只读。
- UI 文案需同时维护简体中文与英文，并保留无障碍语义。
- 新测试应保护稳定行为、契约或回归，不为易调整的像素和样式细节建立脆弱断言。
- 若改动了数据库、生成绑定或设计颜色 token，请执行 [开发指南](../docs/DEVELOPMENT.md) 中对应的生成步骤并提交所需产物。

## 提交前验证

至少运行所有被改动 package 的完整单元测试。跨端或共享 core 修改通常应运行：

```bash
pnpm --filter @my-reader/fonts test
pnpm --filter @my-reader/i18n test
pnpm --filter @my-reader/tools test
pnpm --filter my-reader run test:unit
pnpm --filter my-reader-mobile exec jest --runInBand
cargo test --workspace
```

此外请运行与你的改动相关的 lint、类型检查、构建或 E2E。若某项无法运行，请在 Pull Request 中写明命令、环境和阻塞原因。

## Pull Request

请在说明中包含：

- 问题与用户可见结果；
- 修改范围与有意不处理的内容；
- 已运行的验证命令与结果；
- UI 修改的桌面/移动截图或录屏；
- 数据迁移、兼容性、隐私或第三方授权影响（如有）。

提交信息使用 Conventional Commits 风格，例如 `fix(mobile): preserve imported filename` 或 `docs: clarify release channels`。

提交贡献即表示你有权提交相关内容，并同意它按本仓库的 [MIT License](../LICENSE) 分发。
