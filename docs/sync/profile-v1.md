# MyReader Profile Sync v1 草案

- 状态：草案
- 协议标识：`profile-v1`
- 所属决策：[ADR-0010](../adr/0010-data-ownership-and-sync-storage.md)

本文定义用户域数据的第一版同步边界。它是实现和测试的输入，但在首个兼容客户端发布前
仍允许通过评审修改。发布后，破坏兼容性的变化必须使用新的协议版本。

## 目标

- 同步跨书库的原始阅读事件和完成历史。
- 每台设备继续使用本地 SQLite，保持完整离线能力。
- 支持 WebDAV、OneDrive 等只能提供文件/对象操作的后端。
- 支持重复上传、重复下载、中断恢复和多设备并发写入。
- 允许未来在相同 Profile 中增加目标、全局设置等同步域。

## 非目标

- 不同步 EPUB、PDF、CBZ 等书籍文件。
- 不替代书库域的进度、书签、批注同步。
- 不同步累计时长、连续天数、热力图等派生统计。
- 不让多台设备直接打开远端 SQLite。
- v1 不定义变更压缩、快照或端到端加密格式。

## 本地存储

每台设备维护自己的 Profile 数据库：

```text
<app-data>/profiles/<profile_id>/profile.db
```

数据库至少包含：

- `profile_meta`：Profile 与设备身份、协议版本。
- `reading_events`：不可约阅读事件。
- `completion_events`：完成和重读历史。
- `sync_outbox`：尚未写入远端变更段的本地变更。
- `sync_cursors`：每个远端设备已连续应用的序号。

具体 SQLite 表结构可以独立演进，但不得改变本文定义的同步身份和合并语义。

## 远端目录

```text
<configured-root>/
└── MyReader/
    └── profiles/
        └── <profile_id>/
            ├── manifest.json
            └── changes/
                ├── <device_id-a>/
                │   ├── 00000000000000000001.jsonl
                │   └── 00000000000000000002.jsonl
                └── <device_id-b>/
                    └── 00000000000000000001.jsonl
```

所有路径段使用小写 UUID 文本；序号使用 20 位、左侧补零的十进制整数，以保证文件名排序
与数值排序一致。

`manifest.json` 只用于发现 Profile 和协议，不承担并发更新的数据聚合：

```json
{
  "profileId": "018f2f7a-7b46-7b10-a4d5-b02c59f5be62",
  "protocol": "profile-v1",
  "createdAt": 1784688000000
}
```

## 变更段

一个变更段只由路径中的 `device_id` 创建一次；发布后不可覆盖。每个文件对应一个严格
递增的变更段序号，文件内可以包含多条变更，但所有记录必须携带与文件名相同的
`sequence`。客户端应先在本地完成序列化，再以目标后端支持的原子创建或“仅当不存在”
语义写入最终路径。

每一行是一个完整 JSON 对象：

```json
{
  "protocol": "profile-v1",
  "profileId": "018f2f7a-7b46-7b10-a4d5-b02c59f5be62",
  "deviceId": "018f2f8d-980b-70ef-b72e-c6e86cb7cc29",
  "sequence": 42,
  "changeId": "018f2f90-fd22-7eb5-a6fe-7e7d817d2ef3",
  "domain": "reading_event",
  "operation": "upsert",
  "entityId": "018f2f90-b775-7e98-9ff7-f84ee1d63eb0",
  "hlc": "1784688000123-000001-018f2f8d",
  "value": {}
}
```

### 公共字段

| 字段 | 含义 |
|---|---|
| `protocol` | 固定为 `profile-v1` |
| `profileId` | 目标用户数据空间 |
| `deviceId` | 产生变更的应用安装 |
| `sequence` | 该设备严格递增的变更段序号，与文件名一致 |
| `changeId` | 变更自身的全局唯一 ID |
| `domain` | 同步域 |
| `operation` | `upsert` 或 `delete` |
| `entityId` | 业务实体稳定 ID |
| `hlc` | 混合逻辑时钟及确定性决胜信息 |
| `value` | 与同步域对应的负载；删除时可以为空对象 |

同一个文件只能包含一个 `sequence`，不得把一个序号拆到多个文件。一个变更段可以批量
携带多个 outbox 变更；最小实现也可以每个文件只写一条变更。

## `reading_event`

阅读事件表示在一段确定时间内对某本书产生的有效阅读时长：

```json
{
  "libraryUuid": "13b5d5f0-a2b9-4006-bb27-1db93b59742f",
  "bookUuid": "540c95c3-1d1b-4a31-9d81-1dd102cdd27e",
  "format": "EPUB",
  "startedAt": 1784688000000,
  "durationSeconds": 84,
  "localDay": "2026-07-22",
  "utcOffsetMinutes": 480
}
```

约束：

- `entityId` 就是 `event_id`，创建后不得改变。
- `libraryUuid + bookUuid` 构成 `book_ref`；不得传输本机 `book_id`。
- `startedAt` 使用 Unix 毫秒 UTC。
- `localDay` 和 `utcOffsetMinutes` 在事件发生时固定，用于保持用户当时看到的日历归属。
- 同一个事件允许在阅读过程中用更大的 `durationSeconds` 再次刷新。
- 合并同一个 `event_id` 时取最大 `durationSeconds`，不得相加。
- `book_ref`、格式、开始时间和日期归属发生冲突时，记录同步错误，不得用 LWW 静默改写身份。
- 暂停、进入后台、空闲超时或关闭书籍后结束当前事件；恢复阅读时创建新事件。

## `completion_event`

完成事件表示一次完成或重读行为：

```json
{
  "libraryUuid": "13b5d5f0-a2b9-4006-bb27-1db93b59742f",
  "bookUuid": "540c95c3-1d1b-4a31-9d81-1dd102cdd27e",
  "format": "EPUB",
  "completedAt": 1784688084000,
  "localDay": "2026-07-22",
  "utcOffsetMinutes": 480,
  "kind": "completed"
}
```

每次完成或重读使用新的 `entityId`。首次完成时间、已读本数和重读次数由事件集合计算，
不在同步负载中保存聚合值。

## 删除

- 删除单个事件时发送 `operation: "delete"`，并保留 tombstone。
- 从应用中移除书库不产生事件删除。
- 只有用户显式执行“忘记书库阅读历史”时，才为相关事件生成 tombstone。
- v1 不进行 tombstone 垃圾回收；后续版本必须在定义设备确认和保留期后才能增加回收。

## 推送

1. 本地业务事务同时写入业务表和带本地顺序的 `sync_outbox`。
2. 推送器按本地顺序读取尚未发布的 outbox 记录。
3. 分配下一个远端变更段 `sequence`，将一条或多条变更序列化为不可变 JSONL 段。
4. 成功创建远端对象后，记录已发布 sequence。
5. 重试时如果目标对象已存在，先验证内容摘要；相同则视为成功，不同则停止同步并报告冲突。

不得仅使用墙上时钟 `updated_at` 枚举本地增量，因为时钟回拨或相同毫秒写入可能遗漏变更。

## 拉取

1. 枚举 `changes/` 下除本机外的设备目录。
2. 从该远端设备的最高连续已应用 sequence 之后开始读取。
3. 验证路径设备、Profile、协议版本和记录设备一致。
4. 在本地事务中幂等应用变更。
5. 事务成功后才推进该远端设备的游标。
6. 遇到缺失 sequence、损坏文件、未知协议或未知同步域时停止该设备流，不推进游标。

不同远端设备之间互不阻塞；一个设备流损坏不应阻止其他设备流继续同步。

## 幂等与合并

- `changeId` 已应用时直接跳过。
- `reading_event` 按 `event_id` 求并集；重复版本取最大时长。
- `completion_event` 按事件 ID 求并集。
- 墓碑覆盖同一实体较早的 upsert；未来恢复必须创建新事件 ID。
- 未来增加的可变全局设置使用字段级 HLC/LWW，不能改变事件域的 append-only 语义。
- 应用任意顺序的相同变更集合，最终业务状态必须一致。

## 迁移旧统计

旧书库 `reading_sessions` 和 `reading_completions` 使用本地数值 `book_id`。迁移时：

1. 从对应 Calibre `metadata.db` 读取 `library_id.uuid` 和 `books.uuid`。
2. 用 `profile_id + library_uuid + old_table + old_row_id` 生成确定性 UUID，作为新事件 ID。
3. 将旧 session 当前累计时长写成一个阅读事件；重复执行迁移时必须得到同一事件 ID。
4. 将旧 completion 写成完成事件。
5. 无法解析 `book_uuid` 的记录进入待修复队列，不得把数值 `book_id` 当成跨设备身份上传。
6. 完成校验前保留旧表，不进行破坏性清理。

## 安全与隐私

- 远端 Profile 中不得写入 WebDAV 密码、OAuth token、密钥链引用或设备本地路径。
- 书名和作者不是同步身份。v1 阅读事件不要求携带它们，以减少隐私暴露和元数据冲突。
- 传输层必须使用对应提供方支持的 TLS。
- 端到端加密需要独立 ADR 和新协议版本，不能在不改变版本的情况下修改负载含义。

## 实现前必须通过的契约测试

测试描述遵循 `it("should ... when ...")`：

- `it("should keep one event when the same change is applied twice")`
- `it("should keep the greatest duration when the same event is reflushed")`
- `it("should not advance the cursor when a sequence is missing")`
- `it("should not advance the cursor when the protocol is unsupported")`
- `it("should preserve reading history when a library is removed")`
- `it("should produce the same migrated event id when migration is retried")`
- `it("should converge when changes are applied in different orders")`
- `it("should reject a reading event when its stable book identity changes")`

这些测试保护协议不变量，不断言 SQL 语句、内部函数调用或临时文件数量等实现细节。

## v1 发布前待冻结事项

- HLC 的精确编码、比较规则和最大长度。
- 一个 JSONL 段允许包含的最大记录数和最大字节数。
- 后端缺少条件创建能力时的安全发布策略。
- 损坏记录的隔离、重试和用户可见错误模型。
- Profile 首次创建与已有远端 Profile 的连接流程。
