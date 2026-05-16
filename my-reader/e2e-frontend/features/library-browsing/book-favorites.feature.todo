@regression @favorite
Feature: 书籍收藏
  作为一位 MyReader 用户
  我希望收藏喜欢的书籍并在收藏列表中查看
  这样我可以快速找到常读的书籍

  Background:
    Given 用户访问书库首页
    And 书库中已存在书籍

  @smoke
  Scenario: 在详情页收藏书籍
    Given 用户已打开书籍详情页
    When 用户点击收藏按钮
    Then 收藏按钮应显示为已收藏状态

  Scenario: 收藏后书籍出现在收藏列表中
    Given 用户已打开书籍详情页
    When 用户点击收藏按钮
    And 用户导航到侧边栏 "收藏" 视图
    Then 收藏列表应包含该书籍

  Scenario: 取消收藏书籍
    Given 用户已收藏当前书籍
    And 用户已打开书籍详情页
    When 用户点击收藏按钮
    Then 收藏按钮应显示为未收藏状态

  Scenario: 取消收藏后书籍从收藏列表中消失
    Given 用户已收藏当前书籍
    And 用户已打开书籍详情页
    When 用户点击收藏按钮
    And 用户导航到侧边栏 "收藏" 视图
    Then 收藏列表不应包含该书籍

  Scenario: 收藏列表为空时显示空状态
    Given 用户未收藏任何书籍
    When 用户导航到侧边栏 "收藏" 视图
    Then 收藏列表应显示空状态提示
