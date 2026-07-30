# my-reader-core 运行基线

> 记录日期：2026-07-28
>
> 这些结果用于观察架构迁移后的构建、产物和高频查询成本，不是跨机器通用的性能门禁。比较时应
> 使用同一机器、工具链、构建模式和命令。

## 环境

- macOS 26.5.1（25F80）
- Apple M1 Pro
- 16 GiB 内存
- iOS Simulator
- Android runtime 未验证：当前没有连接 Android 模拟器或设备

## 高频路径

以下命令使用 release 构建、临时真实 SQLite、进程级 runtime 和缓存的 `LibraryStore`：

```bash
cargo run -p my-reader-core --release --example runtime_baseline -- 1000
```

六次运行结果：

| 路径 | 每次迭代次数 | 单次平均值范围 |
|---|---:|---:|
| 已缓存的书库数据库访问 | 1,000 | 1.92–2.08 µs |
| 已缓存连接上的阅读位置查询 | 1,000 | 53.31–66.95 µs |

该示例用于暴露 runtime 或连接缓存意外失效导致的数量级退化，不替代真实 UI 性能测试。

## 原生绑定构建

```bash
pnpm core:build-bindings:ios
pnpm core:build-bindings:android
```

命令使用 `uniffi-bindgen-react-native` 从带 `#[uniffi::export]` 的 Rust API 生成
TypeScript、C++ 和 TurboModule 源码，并在本机构建 XCFramework 或 Android `.so`。这些二进制
产物位于模块的忽略目录，不进入 Git。产物大小不等于最终 IPA/APK 大小；链接器裁剪、架构组合、
调试符号和应用其他资产都会改变最终安装包。

Android universal debug APK 从当前源码完整构建耗时 422.44 s，大小为 347,908,421 字节
（约 331.79 MiB）。它包含开发工具和三个 ABI，只作为本地打包链路参考，不作为发布包体积目标；
包内已确认不存在旧的 `libreact-native-automerge-generated.so`。

```bash
cd my-reader-mobile/android
ANDROID_HOME=/path/to/android-sdk ./gradlew :app:assembleDebug
```

原生门禁现在是编译实际消费绑定的 iOS/Android 应用；具体命令见
[`my-reader-mobile/modules/my-reader-core/README.md`](../my-reader-mobile/modules/my-reader-core/README.md)。
