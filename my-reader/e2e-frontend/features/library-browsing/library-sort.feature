@regression @library-browsing @sort
Feature: 书库排序
  作为一位 MyReader 用户
  我希望按不同方式排序书籍列表
  这样我可以按偏好浏览书籍

  Background:
    Given 用户访问书库首页
    And 书库中已存在书籍

  Scenario Outline: 切换排序方式
    When 用户切换排序为 "<sort_option>"
    Then 书籍列表应按 "<sort_option>" 排序

    Examples:
      | sort_option |
      | 最近添加     |
      | 书名        |
      | 作者        |
      | 进度        |
