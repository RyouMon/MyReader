@regression @reader @loading
Feature: 阅读器书籍加载
  作为一位 MyReader 用户
  我希望打开书籍后能获得明确的状态反馈
  这样当加载异常时我知道发生了什么

  Background:
    Given 用户已选择书库

  @smoke
  Scenario: 书籍源准备无响应时应给出超时提示
    Given 书库中存在一本可读的 EPUB 书籍
    And 书籍内容源在 10 秒内未能就绪
    When 用户打开该书进行阅读
    Then 阅读器应显示"正在加载书籍…"
    And 阅读器应在 11 秒内显示加载失败提示
    And 阅读器不再显示"正在加载书籍…"

  @smoke @positive
  Scenario: 正常打开书籍后进入阅读界面
    Given 书库中存在一本可读的 EPUB 书籍
    When 用户打开该书进行阅读
    Then 阅读器应在 5 秒内离开初始加载状态
    And 阅读器不再显示"正在加载书籍…"
