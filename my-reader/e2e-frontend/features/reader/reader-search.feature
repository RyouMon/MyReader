@regression @reader @search
Feature: 搜索跳转后保留结果面板
  Scenario: 连续跳转搜索结果后仍可手动关闭面板
    Given 小文已打开支持跨页句子的测试书籍
    When 小文在书内搜索 "target"
    And 小文选择搜索结果 "Progress jump target"
    Then 搜索面板保留 "target" 的结果并选中 "Progress jump target"
    When 小文选择搜索结果 "Page turn target"
    Then 搜索面板保留 "target" 的结果并选中 "Page turn target"
    When 小文关闭搜索面板
    Then 搜索面板已关闭
