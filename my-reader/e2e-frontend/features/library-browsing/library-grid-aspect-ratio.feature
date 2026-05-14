@regression @library @grid
Feature: 书库网格视图宽高比一致性

  Background:
    Given 书库中已存在 100 本书
    And 视图模式为网格
    And 用户访问书库首页

  @smoke
  Scenario Outline: 不同页面宽度下书籍卡片保持 2:3 宽高比
    When 窗口宽度调整为 <width> 像素
    Then 每个可见书籍卡片的宽高比应为 2:3

    Examples:
      | width |
      | 300   |
      | 1280  |
      | 1920  |
