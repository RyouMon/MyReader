# language: zh-CN
@qwen-tts
功能: 从不同来源配置 Qwen 朗读服务
  用户可以获取服务支持的模型，同时导入对应的系统音色和账户音色。

  背景:
    假如用户正在选择语音服务来源

  场景: 获取套餐语音模型和系统音色
    当用户选择"Qwen · Token Plan"来源
    而且用户获取并添加模型"qwen-audio-3.0-tts-plus"
    那么服务地址为"wss://token-plan.maas.qianwenaiapi.com/api-ws/v1/inference"
    而且导入模型的声音 ID 为"longanhuan_v3.6"

  场景大纲: 创建按用量计费的服务
    当用户选择"<来源>"来源
    而且用户获取并添加模型"qwen-audio-3.0-tts-plus"
    而且用户保存语音服务
    那么该服务使用"<地址>"且保留所选来源名称

    例子:
      | 来源                    | 地址                                |
      | Qwen · 按需计费          | https://maas.qianwenaiapi.com/api/v1  |
      | Qwen · DashScope（百炼） | https://dashscope.aliyuncs.com/api/v1 |

  场景: 导入并保存账户中的复刻音色
    当用户选择"Qwen · DashScope（百炼）"来源
    而且用户获取并添加模型"qwen3-tts-vc-2026-01-22"
    那么导入模型的声音 ID 为"my-clone"
    当用户保存语音服务
    那么已保存的模型"qwen3-tts-vc-2026-01-22"包含音色"my-clone"

  场景: 多个模型分别保存对应的音色
    当用户选择"Qwen · DashScope（百炼）"来源
    而且用户获取并添加模型"qwen3-tts-vc-2026-01-22"
    而且用户获取并添加模型"qwen3-tts-vd-2026-01-26"
    那么导入模型的声音 ID 为"my-design"
    当用户保存语音服务
    那么两个模型分别保留各自的账户音色

  场景: 使用目录之外的新音色
    当用户选择"Qwen · Token Plan"来源
    而且用户获取并添加模型"qwen-audio-3.0-tts-plus"
    而且用户手动填写新音色"future-voice"
    而且用户保存语音服务
    那么已保存的模型"qwen-audio-3.0-tts-plus"包含音色"future-voice"
