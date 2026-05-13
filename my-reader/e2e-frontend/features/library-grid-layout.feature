@regression @library @grid-layout
Feature: 书库网格视图布局
  作为一位 MyReader 用户
  我希望在网格视图中浏览大量书籍时，每本书都能完整显示
  这样我可以清楚地看到封面和书名，不会有内容被遮挡

  Background:
    Given 书库中已存在 100 本书
    And 用户处于网格视图模式

  @smoke @layout
  Scenario Outline: 不同窗口宽度下书籍卡片完整显示
    Given 用户访问书库首页
    When 窗口宽度调整为 <viewport_width> 像素
    Then 网格中每本书的封面和标题都完整可见
    And 没有任何书籍被其他书籍遮挡

    Examples:
      | viewport_width |
      | 300            |
      | 350            |
      | 400            |
      | 550            |
      | 750            |
      | 1280           |
      | 1440           |
      | 1600           |
      | 1920           |

  @scroll @layout
  Scenario: 滚动浏览时书籍持续完整显示
    Given 用户访问书库首页
    When 用户向下滚动书库列表
    Then 可见区域内的每本书都完整显示
    And 没有任何书籍被其他书籍遮挡
