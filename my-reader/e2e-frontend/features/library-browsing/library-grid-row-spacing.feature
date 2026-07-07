@regression @library @grid-layout @row-spacing
Feature: 书库网格视图行距一致性
  作为一位 MyReader 用户
  我希望网格视图中每行书籍占据的垂直空间保持一致
  这样无论窗口大小或列数如何变化，页面看起来都整齐统一

  Background:
    Given 书库中已存在 100 本书
    And 视图模式为网格

  @layout @row-spacing
  Scenario Outline: 同一列数下调整窗口宽度行距不变
    Given 用户访问书库首页
    When 窗口宽度调整为 <narrow_width> 像素
    And 记录第一行与第二行书籍之间的垂直间距
    And 窗口宽度调整为 <wide_width> 像素
    Then 第一行与第二行书籍之间的垂直间距应与记录值相同

    Examples:
      | narrow_width | wide_width |
      | 400          | 420        |
      | 550          | 540        |
      | 1280         | 1300       |

  @layout @row-spacing
  Scenario Outline: 不同列数下行距保持一致
    Given 用户访问书库首页
    When 窗口宽度调整为 <viewport_width> 像素
    Then 第一行与第二行书籍之间的垂直间距应为 <expected_spacing> 像素

    Examples:
      | viewport_width | expected_spacing |
      | 300            | 12               |
      | 1280           | 12               |
      | 1920           | 12               |
