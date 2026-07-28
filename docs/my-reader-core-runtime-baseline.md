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

## 原生构建

从 Core 源码发生变化后的增量验证，以及随后不修改源码的再次验证：

| 平台 | 源码变化后 | 无变化复跑 |
|---|---:|---:|
| iOS | 68.46 s | 12.64 s |
| Android | 189.08 s | 14.67 s |

命令：

```bash
./my-reader-mobile/modules/my-reader-core/scripts/verify-native.sh ios
./my-reader-mobile/modules/my-reader-core/scripts/verify-native.sh android
```

构建时间包含 binding 生成、Rust 交叉编译和原生工程检查，只应与相同命令的历史结果比较。

## 原生产物

`verify-native.sh` 生成的 canonical 静态库：

| 目标 | 字节 | 约 MiB |
|---|---:|---:|
| iOS Simulator | 103,281,824 | 98.50 |
| Android arm64-v8a | 7,077,128 | 6.75 |
| Android armeabi-v7a | 4,869,448 | 4.64 |
| Android x86_64 | 7,823,128 | 7.46 |

静态库大小不等于最终 IPA/APK 大小；链接器裁剪、架构组合、调试符号和应用其他资产都会改变最终
安装包。本仓库不提交这些生成产物。

Android universal debug APK 从当前源码完整构建耗时 422.44 s，大小为 347,908,421 字节
（约 331.79 MiB）。它包含开发工具和三个 ABI，只作为本地打包链路参考，不作为发布包体积目标；
包内已确认不存在旧的 `libreact-native-automerge-generated.so`。

```bash
cd my-reader-mobile/android
ANDROID_HOME=/path/to/android-sdk ./gradlew :app:assembleDebug
```

## 原生运行门禁

- iOS Swift Testing runtime smoke：2 项通过；合同加载约 0.001 s，数据库迁移约 0.026 s。
- Android instrumentation APK 已从源码编译；连接设备后运行
  `:my-reader-core:connectedDebugAndroidTest` 完成 runtime 门禁。

具体命令见
[`my-reader-mobile/modules/my-reader-core/README.md`](../my-reader-mobile/modules/my-reader-core/README.md)。
