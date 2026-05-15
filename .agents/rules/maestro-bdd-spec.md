---
paths:
  - "my-reader-mobile/**/*"
---

# Maestro + BDD 测试架构规则

## 一、三层架构

| 层 | 文件 | 职责 |
|---|---|---|
| L0 Feature | `.feature` | Gherkin业务规范，零技术细节 |
| L1 Step | `.yaml` | 可复用的子流程，每个action一个文件 |
| L2 Executable | `.yaml` | 可执行Maestro Flow，机械组装Step |

---

## 二、目录结构

```
e2e/
├── features/                          ← L0
│   └── {domain}/
│       └── {feature}.feature
├── steps/                             ← L1
│   └── {domain}/
│       ├── given/
│       ├── when/
│       └── then/
└── maestro/                           ← L2（生成目录）
    └── {domain}/
        └── {feature}.yaml
```

---

## 三、文件命名

| 类型 | 格式 | 示例 |
|---|---|---|
| Feature | `kebab-case.feature` | `login.feature` |
| Step | `{action}.yaml` | `user_launches_app.yaml` |
| 生成Flow | `{feature}.yaml` | `login.yaml` |

Step文件名使用英文snake_case，不加when/then/given前缀（由父目录表达行为类型）：
- `user_launches_app` — 用户操作
- `home_page_should_be_visible` — 断言验证
- `user_has_registered_account` — 前置状态（如有）

---

## 四、Step 编写规范

1. **原子化**：一个文件只做一个action，不超过10行
2. **直接操作**：Step中直接写Maestro命令（`tapOn`/`assertVisible`等），不额外封装Page层
3. **复用通过文件**：需要复用的命令序列抽成独立的Step子流程文件，通过`runFlow`引用
4. **无元素定位抽象**：选择器字符串直接出现在Step中，保持可读性
5. **环境变量**：通过`${VAR}`引用，由调用方在`env`中传入

---

## 五、Step 文件格式

标准Maestro flow，无分组结构：

```yaml
appId: ${APP_ID}
---
- tapOn: "登录按钮"
```

---

## 六、Feature 到 Step 的映射规则

### 转换算法

1. **确定前缀**：
   - `Given` → `given_`
   - `When` 或 `And`/`But`（紧跟When之后）→ `when_`
   - `Then` 或 `And`/`But`（紧跟Then之后）→ `then_`

2. **去除参数**：去掉Cucumber Expression（`{string}`、`{int}`等）和引号包裹的实际值

3. **转为snake_case**：剩余文本翻译为英文动词短语

4. **定位文件**：在 `steps/{domain}/{group}/` 下查找同名yaml文件（group为given/when/then）

### 映射示例

| Gherkin步骤 | Step文件 |
|---|---|
| `Given 用户已注册账户` | `steps/auth/given/user_has_registered_account.yaml` |
| `When 用户输入手机号` | `steps/auth/when/user_inputs_phone_number.yaml` |
| `And 用户点击登录按钮` | `steps/auth/when/user_taps_login_button.yaml` |
| `Then 应跳转到首页` | `steps/auth/then/home_page_should_be_visible.yaml` |

---

## 七、转换规则

**输入**：`.feature` + `steps/{domain}/{given|when|then}/*.yaml`
**输出**：`maestro/{domain}/{feature}.yaml`

转换逻辑：
1. 读取Feature所在domain对应的 `steps/{domain}/` 目录
2. 按Scenario顺序遍历每个步骤
3. 按第六节规则将Gherkin步骤转为group+文件名
4. 生成 `runFlow: ../../steps/{domain}/{group}/{action}.yaml`
5. 展开Scenario Outline的Examples

约束：不创造新逻辑，不修改已有step文件。

---

## 八、工作流

```
1. 编写/修改 Feature
        ↓
2. 【等待审核通过】 ← 唯一需要外部审核的节点
        ↓
3. 编写/复用 Step（如需新action，新增文件到steps/{domain}/）
        ↓
4. 生成 maestro/*.yaml
        ↓
5. maestro test
```

提交要求：Feature + steps + maestro 一起提交，确保maestro/*.yaml可随时重新生成。

---

## 九、编辑覆盖策略

| 文件 | 覆盖策略 |
|---|---|
| `.feature` | 持续维护 |
| `steps/{domain}/*.yaml` | 持续维护，同一domain的step集中在一个文件夹 |
| `maestro/*.yaml` | 每次转换重新生成；可临时编辑，但会被覆盖；长期改应回到上游文件 |

---

## 十、总结

```
L0: Feature（Gherkin） → L1: Step（steps/{domain}/{action}.yaml） →
L2: Flow（机械组装）
```

核心原则：业务逻辑写在Feature和Step两层，最终可执行Flow由转换器机械生成。Step直接包含Maestro命令，不额外封装Page层。

---

# 完整示例

## 目录结构

```
e2e/
├── features/
│   └── auth/
│       └── login.feature
├── steps/
│   └── auth/
│       ├── given/
│       │   └── user_has_registered_account.yaml
│       ├── when/
│       │   ├── user_inputs_phone_number.yaml
│       │   ├── user_inputs_verification_code.yaml
│       │   └── user_taps_login_button.yaml
│       └── then/
│           ├── home_page_should_be_visible.yaml
│           └── welcome_message_should_be_displayed.yaml
└── maestro/
    └── auth/
        └── login.yaml
```

---

## L0: Feature

`features/auth/login.feature`

```gherkin
Feature: 用户认证
  作为已注册用户
  我希望通过手机号和验证码登录
  以便访问我的个人中心

  Rule: 有效凭证允许访问

    Scenario: 使用有效手机号和验证码登录成功
      Given 用户已注册账户 "13800138000"
      When 用户输入手机号 "13800138000"
      And 用户输入验证码 "123456"
      And 用户点击登录按钮
      Then 应跳转到首页
      And 应显示欢迎提示
```

---

## L1: Step

`steps/auth/given/user_has_registered_account.yaml`

```yaml
appId: ${APP_ID}
---
- runScript: |
    var resp = http.post('${API_BASE}/users', {
      body: JSON.stringify({ phone: '${phone}' })
    });
    output.userId = json(resp.body).id;
```

`steps/auth/when/user_inputs_phone_number.yaml`

```yaml
appId: ${APP_ID}
---
- tapOn: "手机号输入框"
- inputText: "${phone}"
```

`steps/auth/when/user_inputs_verification_code.yaml`

```yaml
appId: ${APP_ID}
---
- tapOn: "验证码输入框"
- inputText: "${code}"
```

`steps/auth/when/user_taps_login_button.yaml`

```yaml
appId: ${APP_ID}
---
- tapOn: "登录按钮"
```

`steps/auth/then/home_page_should_be_visible.yaml`

```yaml
appId: ${APP_ID}
---
- assertVisible: "首页"
```

`steps/auth/then/welcome_message_should_be_displayed.yaml`

```yaml
appId: ${APP_ID}
---
- assertVisible: "欢迎回来"
```

---

## L2: 生成的可执行 Flow

`maestro/auth/login.yaml`

```yaml
appId: ${APP_ID}
---
# Feature: 用户认证
# Scenario: 使用有效手机号和验证码登录成功

# Given 用户已注册账户 "13800138000"
- runFlow: ../../steps/auth/given/user_has_registered_account.yaml
  env:
    phone: "13800138000"

# When 用户输入手机号 "13800138000"
- runFlow: ../../steps/auth/when/user_inputs_phone_number.yaml
  env:
    phone: "13800138000"

# And 用户输入验证码 "123456"
- runFlow: ../../steps/auth/when/user_inputs_verification_code.yaml
  env:
    code: "123456"

# And 用户点击登录按钮
- runFlow: ../../steps/auth/when/user_taps_login_button.yaml

# Then 应跳转到首页
- runFlow: ../../steps/auth/then/home_page_should_be_visible.yaml

# And 应显示欢迎提示
- runFlow: ../../steps/auth/then/welcome_message_should_be_displayed.yaml
```
