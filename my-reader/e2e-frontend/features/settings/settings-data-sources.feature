# Layer 4: Playwright E2E — data source management in settings
@regression @settings @data-sources
Feature: 数据源管理
  作为一位 MyReader 用户
  我希望在设置中管理数据源连接
  这样我可以配置本地存储和 WebDAV 等数据来源

  Background:
    Given 用户已导航到设置页面
    And 用户在 "数据源管理" 分区

  @smoke
  Scenario: 显示已配置的数据源列表
    Then 应显示已配置的数据源列表

  Scenario: 内置本地存储数据源标记为只读
    Then 本地存储数据源应显示 "内置" 标记
    And 本地存储数据源应不可删除

  Scenario: 添加数据源按钮可见
    Then 应显示 "添加数据源" 按钮

  @add-webdav
  Scenario: 打开添加 WebDAV 数据源表单
    When 用户点击 "添加数据源" 按钮
    Then 应显示 WebDAV 数据源表单
    And 表单应包含 "服务地址" 输入框
    And 表单应包含 "端口" 输入框
    And 表单应包含 "用户名" 输入框
    And 表单应包含 "密码" 输入框
    And 表单应包含 "根路径" 输入框

  @add-webdav
  Scenario: 填写完整信息后添加 WebDAV 数据源
    Given 用户已打开添加数据源表单
    When 用户填写服务地址 "https://cloud.example.com"
    And 用户填写用户名 "user1"
    And 用户填写密码 "pass123"
    And 用户点击提交按钮
    Then 数据源列表应包含新增的 WebDAV 数据源

  @add-webdav
  Scenario: 服务地址格式不合法时显示校验错误
    Given 用户已打开添加数据源表单
    When 用户填写服务地址 "not-a-url"
    And 用户点击提交按钮
    Then 应显示 URL 格式校验错误提示

  @add-webdav
  Scenario: 用户名或密码为空时显示校验错误
    Given 用户已打开添加数据源表单
    When 用户填写服务地址 "https://cloud.example.com"
    And 用户清空用户名输入框
    And 用户点击提交按钮
    Then 应显示必填校验错误提示

  @add-webdav
  Scenario: 端口超出范围时显示校验错误
    Given 用户已打开添加数据源表单
    When 用户填写服务地址 "https://cloud.example.com"
    And 用户填写端口 "99999"
    And 用户点击提交按钮
    Then 应显示端口范围校验错误提示

  @add-webdav
  Scenario: 测试 WebDAV 连接成功
    Given 用户已打开添加数据源表单
    And 用户填写了有效的 WebDAV 连接信息
    When 用户点击 "测试连接" 按钮
    Then 应显示连接成功提示

  @add-webdav
  Scenario: 测试 WebDAV 连接失败
    Given 用户已打开添加数据源表单
    And 用户填写了无效的 WebDAV 连接信息
    When 用户点击 "测试连接" 按钮
    Then 应显示连接失败提示

  @delete-webdav
  Scenario: 删除非内置数据源需二次确认
    Given 数据源列表中存在一个 WebDAV 数据源
    When 用户点击该数据源的 "删除" 按钮
    Then 该数据源不应立即被删除
    When 用户再次点击 "删除" 按钮
    Then 该数据源应被移除

  @delete-webdav
  Scenario: 取消删除数据源
    Given 数据源列表中存在一个 WebDAV 数据源
    When 用户点击该数据源的 "删除" 按钮
    And 等待确认超时
    Then 删除操作应自动取消