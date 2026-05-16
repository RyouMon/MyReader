# Layer 4: Playwright E2E — library management in settings
@regression @settings @libraries
Feature: 书库管理
  作为一位 MyReader 用户
  我希望在设置中管理已添加的书库
  这样我可以添加、切换和删除书库引用

  Background:
    Given 用户已导航到设置页面
    And 用户在 "书库管理" 分区

  @smoke
  Scenario: 显示已添加的书库列表
    Then 应显示已添加的书库列表
    And 每个书库应显示名称和路径

  Scenario: 当前书库标记为 "当前"
    Then 当前书库应显示 "当前" 标记

  Scenario: 删除书库需二次确认
    When 用户点击某书库的 "删除书库" 按钮
    Then 该书库不应立即被删除
    When 用户再次点击 "删除书库" 按钮
    Then 该书库应被移除

  Scenario: 取消删除书库
    When 用户点击某书库的 "删除书库" 按钮
    And 等待确认超时
    Then 删除操作应自动取消

  Scenario: 添加书库按钮可见
    Then 应显示 "添加书库" 按钮

  @add-local
  Scenario: 打开添加书库表单
    When 用户点击 "添加书库" 按钮
    Then 应显示添加书库表单
    And 表单应包含数据源选择器
    And 表单应包含路径输入框
    And 表单应包含 "浏览" 按钮

  @add-local
  Scenario: 添加本地书库
    Given 用户已打开添加书库表单
    And 数据源选择为 "本地存储"
    When 用户通过浏览按钮选择本地书库目录
    And 用户点击提交按钮
    Then 书库列表应包含新增的书库
    And 新增书库应显示名称和路径

  @add-local
  Scenario: 本地书库路径为空时显示校验错误
    Given 用户已打开添加书库表单
    And 数据源选择为 "本地存储"
    When 用户清空路径输入框
    And 用户点击提交按钮
    Then 应显示路径必填校验错误

  @add-local
  Scenario: 添加无效路径的本地书库显示错误
    Given 用户已打开添加书库表单
    And 数据源选择为 "本地存储"
    When 用户填写路径 "/nonexistent/path"
    And 用户点击提交按钮
    Then 应显示添加失败错误提示
