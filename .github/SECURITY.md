<div align="right"><a href="./SECURITY_EN.md">English</a></div>

# 安全策略

## 支持范围

MyReader 尚未达到 1.0。安全修复优先发布到最新版本；旧版本不保证获得回补。

## 报告漏洞

请不要为安全漏洞创建公开 Issue，也不要在报告中附带真实书籍、云盘凭据或其他私人数据。

优先使用仓库的 [GitHub 私密漏洞报告](https://github.com/RyouMon/MyReader/security/advisories/new)。如果仓库暂未开放该入口，可发送邮件至 [wenslife@outlook.com](mailto:wenslife@outlook.com)，主题以 `[MyReader Security]` 开头。

请尽量提供：

- 受影响版本、平台与架构；
- 复现步骤和实际影响；
- 最小化、已脱敏的日志或示例；
- 已知缓解方法（如有）。

收到报告后会先确认影响范围，再协调修复与披露时间。在修复公开前，请避免公开细节或利用漏洞访问不属于你的数据。

## 数据与凭据边界

MyReader 可以连接本地目录、WebDAV 与 OneDrive。请使用测试账号和测试书库复现问题，并在分享配置、数据库、崩溃报告或屏幕录制前移除访问令牌、密码、服务器地址、个人路径和书籍内容。
