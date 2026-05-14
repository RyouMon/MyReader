---
paths:
  - "my-reader-mobile/**/*"
---

# Maestro + BDD 测试架构规则

## 一、四层架构

| 层 | 文件 | 职责 |
|---|---|---|
| L0 Feature | `.feature` | Gherkin业务规范，零技术细节 |
| L1 Step | `.yaml` | GWT定义，只`runFlow`调用下层，不直接操作元素 |
| L2 Page / API | `.yaml` | Page封装UI定位，API封装后端调用 |
| L3 Executable | `.yaml` | 可执行Maestro Flow |

---

## 二、目录结构

```
e2e/
├── features/                          ← L0
│   └── {domain}/
│       └── {feature}.feature
├── steps/                             ← L1
│   └── {domain}.yaml
├── pages/                             ← L2a
│   └── {page}.yaml
├── api/                               ← L2b
│   └── {domain}.{resource}.yaml
└── maestro/                           ← L3（生成目录）
    └── {domain}/
        └── {feature}.yaml
```

---

## 三、文件命名

| 类型 | 格式 | 示例 |
|---|---|---|
| Feature | `kebab-case.feature` | `login.feature` |
| Step | `{domain}.yaml` | `auth.yaml` |
| Page | `{page}.yaml` | `login.yaml` |
| API | `{domain}.{resource}.yaml` | `auth.users.yaml` |
| 生成Flow | `{feature}.yaml` | `login.yaml` |

---

## 四、Step 编写规范

1. **只做分发**：`runFlow`调用下层，不出现`tapOn`/`inputText`等命令
2. **Given不走UI**：调用API层直接设置系统状态
3. **When走Page**：调用Page层模拟用户操作
4. **Then走Page+assert**：调用Page层验证，或直接用`assertVisible`
5. **原子化**：一个action只做一件事，不超过5行
6. **无元素定位**：不出现选择器字符串，选择器在Page层

---

## 五、Step 文件内部分组

一个domain一个文件，内部用 `given:` / `when:` / `then:` 分组，action名用英文snake_case。

```yaml
# steps/auth.yaml
appId: ${APP_ID}
---
given:
  user_has_registered_account:
    - runFlow: ../api/auth.users.yaml
      env:
        ACTION: create_user
        phone: ${phone}

when:
  user_inputs_phone_number:
    - runFlow: ../pages/login.yaml
      env:
        ACTION: input_phone
        phone: ${phone}

  user_taps_login_button:
    - runFlow: ../pages/login.yaml
      env:
        ACTION: submit

then:
  home_page_should_be_visible:
    - runFlow: ../pages/home.yaml
      env:
        ACTION: assert_visible
```

---

## 六、Feature 到 Step 的映射规则

### 转换算法

1. **确定分组**：
   - `Given` → `given.`
   - `When` 或 `And`/`But`（紧跟When之后）→ `when.`
   - `Then` 或 `And`/`But`（紧跟Then之后）→ `then.`

2. **去除参数**：去掉Cucumber Expression（`{string}`、`{int}`等）和引号包裹的实际值

3. **转为snake_case**：剩余文本翻译为英文动词短语

4. **定位**：在 `steps/{domain}.yaml` 的对应分组下查找action

### 映射示例

| Gherkin步骤 | steps.yaml 路径 |
|---|---|
| `Given 用户已注册账户` | `auth.yaml → given.user_has_registered_account` |
| `When 用户输入手机号` | `auth.yaml → when.user_inputs_phone_number` |
| `And 用户输入验证码` | `auth.yaml → when.user_inputs_verification_code` |
| `And 用户点击登录按钮` | `auth.yaml → when.user_taps_login_button` |
| `Then 应跳转到首页` | `auth.yaml → then.home_page_should_be_visible` |
| `And 应显示欢迎提示` | `auth.yaml → then.welcome_message_should_be_displayed` |

---

## 七、转换规则

**输入**：`.feature` + `steps/{domain}.yaml` + `pages/*.yaml` + `api/*.yaml`
**输出**：`maestro/{domain}/{feature}.yaml`

转换逻辑：
1. 读取Feature所在domain对应的 `steps/{domain}.yaml`
2. 按Scenario顺序遍历每个步骤
3. 按第六节规则将Gherkin步骤转为action路径
4. 生成 `runFlow: ../steps/{domain}.yaml` + `env.ACTION: {group}.{action}`
5. 展开Scenario Outline的Examples

约束：不创造新逻辑，不修改已有step/page/api文件。

---

## 八、工作流

```
1. 编写/修改 Feature
        ↓
2. 【等待审核通过】 ← 唯一需要外部审核的节点
        ↓
3. 编写/复用 Step（如需新action，追加到domain.yaml）
        ↓
4. 编写/复用 Page 或 API（Step依赖的下层）
        ↓
5. 生成 maestro/*.yaml
        ↓
6. maestro test
```

提交要求：Feature + steps + pages + api + maestro 一起提交，确保maestro/*.yaml可随时重新生成。

---

## 九、Given/When/Then 调用边界

| 分组 | 允许调用 | 禁止 |
|---|---|---|
| `given.*` | `api/*.yaml`, `runScript` | `pages/*.yaml`（状态设置不走UI） |
| `when.*` | `pages/*.yaml` | `api/*.yaml`（操作用UI） |
| `then.*` | `pages/*.yaml`, `assert*` | `runScript`查数据库（验证可见输出） |

---

## 十、编辑覆盖策略

| 文件 | 覆盖策略 |
|---|---|
| `.feature` | 持续维护 |
| `steps/{domain}.yaml` | 持续维护，同一domain的action集中管理 |
| `.yaml` | 持续维护 |
| `.yaml` | 持续维护 |
| `maestro/*.yaml` | 每次转换重新生成；可临时编辑，但会被覆盖；长期改应回到上游文件 |

---

## 十一、总结

```
L0: Feature（Gherkin） → L1: Step（steps/{domain}.yaml，内部分given/when/then） →
L2: Page/API（子流程） → L3: Flow（机械组装）
```

核心原则：业务逻辑写在Feature、Step、Page、API四层，最终可执行Flow由转换器机械生成。

---

# 完整示例

## 目录结构

```
e2e/
├── features/
│   └── auth/
│       └── login.feature
├── steps/
│   └── auth.yaml
├── pages/
│   ├── login.yaml
│   └── home.yaml
├── api/
│   └── auth.users.yaml
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

`steps/auth.yaml`

```yaml
appId: ${APP_ID}
---
given:
  user_has_registered_account:
    - runFlow: ../api/auth.users.yaml
      env:
        ACTION: create_user
        phone: ${phone}

when:
  user_inputs_phone_number:
    - runFlow: ../pages/login.yaml
      env:
        ACTION: input_phone
        phone: ${phone}

  user_inputs_verification_code:
    - runFlow: ../pages/login.yaml
      env:
        ACTION: input_code
        code: ${code}

  user_taps_login_button:
    - runFlow: ../pages/login.yaml
      env:
        ACTION: submit

then:
  home_page_should_be_visible:
    - runFlow: ../pages/home.yaml
      env:
        ACTION: assert_visible

  welcome_message_should_be_displayed:
    - assertVisible: "欢迎回来"

  login_page_should_still_be_visible:
    - runFlow: ../pages/login.yaml
      env:
        ACTION: assert_visible

  error_message_should_display:
    - assertVisible: ${message}
```

---

## L2a: Page Object

`pages/login.yaml`

```yaml
appId: ${APP_ID}
---
input_phone:
  - tapOn: "手机号输入框"
  - inputText: ${phone}

input_code:
  - tapOn: "验证码输入框"
  - inputText: ${code}

submit:
  - tapOn: "登录按钮"

assert_visible:
  - assertVisible: "手机号输入框"
```

`pages/home.yaml`

```yaml
appId: ${APP_ID}
---
assert_visible:
  - assertVisible: "首页"
```

---

## L2b: API

`api/auth.users.yaml`

```yaml
appId: ${APP_ID}
---
create_user:
  - runScript: |
      var resp = http.post('${API_BASE}/users', {
        body: JSON.stringify({ phone: maestro.env.phone })
      });
      output.userId = json(resp.body).id;
```

---

## L3: 生成的可执行 Flow

`maestro/auth/login.yaml`

```yaml
appId: ${APP_ID}
---
# Feature: 用户认证
# Scenario: 使用有效手机号和验证码登录成功

# Given 用户已注册账户 "13800138000"
- runFlow: ../../steps/auth.yaml
  env:
    ACTION: given.user_has_registered_account
    phone: "13800138000"

# When 用户输入手机号 "13800138000"
- runFlow: ../../steps/auth.yaml
  env:
    ACTION: when.user_inputs_phone_number
    phone: "13800138000"

# And 用户输入验证码 "123456"
- runFlow: ../../steps/auth.yaml
  env:
    ACTION: when.user_inputs_verification_code
    code: "123456"

# And 用户点击登录按钮
- runFlow: ../../steps/auth.yaml
  env:
    ACTION: when.user_taps_login_button

# Then 应跳转到首页
- runFlow: ../../steps/auth.yaml
  env:
    ACTION: then.home_page_should_be_visible

# And 应显示欢迎提示
- runFlow: ../../steps/auth.yaml
  env:
    ACTION: then.welcome_message_should_be_displayed
```
