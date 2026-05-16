@regression @library-browsing @search
Feature: 书库搜索
  作为一位 MyReader 用户
  我希望按关键词搜索书籍
  这样我可以快速找到想要的书籍

  Background:
    Given 用户访问书库首页
    And 书库中已存在书籍

  Scenario: 按书名搜索书籍
    When 用户搜索 "Jane"
    Then 书籍列表应只显示匹配的书籍
    And 书籍总数应更新为匹配数量

  Scenario: 清空搜索关键词恢复全部书籍
    Given 用户已搜索 "Jane"
    When 用户清空搜索框
    Then 书籍列表应恢复显示全部书籍
