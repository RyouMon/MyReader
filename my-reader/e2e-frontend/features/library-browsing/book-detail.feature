# Layer 4: Playwright E2E — book detail page behavior
@regression @book-detail
Feature: 书籍详情页
  作为一位 MyReader 用户
  我希望查看书籍的详细信息
  这样我可以了解书籍内容并决定是否阅读

  Background:
    Given 用户访问书库首页
    And 书库中已存在书籍

  @smoke
  Scenario: 打开书籍详情页
    When 用户点击一本书籍
    Then 应显示该书籍的详情页
    And 详情页应显示书籍标题
    And 详情页应显示书籍作者

  @smoke
  Scenario: 详情页显示返回书库按钮
    Given 用户已打开书籍详情页
    Then 详情页应显示 "返回书库" 按钮

  @navigation
  Scenario: 从详情页返回书库
    Given 用户已打开书籍详情页
    When 用户点击 "返回书库" 按钮
    Then 应返回书库首页

  @read
  Scenario: 从详情页开始阅读
    Given 用户已打开书籍详情页
    When 用户点击 "开始阅读" 按钮
    Then 应打开阅读器

  @format
  Scenario: 选择格式后阅读
    Given 用户已打开书籍详情页
    And 书籍有多种可读格式
    When 用户选择 "EPUB" 格式
    And 用户点击 "开始阅读" 按钮
    Then 应以 EPUB 格式打开阅读器

  @synopsis
  Scenario: 展开书籍简介
    Given 用户已打开书籍详情页
    And 书籍有简介内容
    When 用户点击 "展开全文" 按钮
    Then 应显示完整简介内容

  @synopsis
  Scenario: 收起书籍简介
    Given 用户已展开书籍简介
    When 用户点击 "收起" 按钮
    Then 简介内容应恢复为截断显示

  @format-table
  Scenario: 从格式表格阅读特定格式
    Given 用户已打开书籍详情页
    And 书籍有多种可读格式
    When 用户在格式表格中点击某格式的 "开始阅读" 按钮
    Then 应以该格式打开阅读器
