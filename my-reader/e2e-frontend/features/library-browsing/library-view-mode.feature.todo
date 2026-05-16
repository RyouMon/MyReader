@regression @library-browsing @layout
Feature: 书库视图设置
  作为一位 MyReader 用户
  我希望在网格和列表视图之间切换
  这样我可以按偏好浏览书籍

  Background:
    Given 用户访问书库首页
    And 书库中已存在书籍

  Scenario: 切换为列表视图
    Given 视图模式为网格
    When 用户切换为列表视图
    Then 书籍应以列表形式展示

  Scenario: 切换为网格视图
    Given 视图模式为列表
    When 用户切换为网格视图
    Then 书籍应以网格形式展示
