# Layer 4: Playwright E2E — reflowable book reader behavior (EPUB)
@regression @reader @reflowable
Feature: 可重排版阅读器
  作为一位 MyReader 用户
  我希望在阅读可重排版书籍时翻页和调整排版设置
  这样我可以舒适地阅读 EPUB 等格式的书籍

  Background:
    Given 用户已打开一本 EPUB 书籍的阅读器

  @smoke
  Scenario: 阅读器显示书籍内容
    Then 阅读器应显示书籍内容区域

  @smoke
  Scenario: 点击右侧区域翻到下一页
    When 用户点击阅读器右侧翻页区域
    Then 应翻到下一页

  @smoke
  Scenario: 点击左侧区域翻到上一页
    Given 用户已翻到第二页
    When 用户点击阅读器左侧翻页区域
    Then 应翻到上一页

  @chrome
  Scenario: 悬停显示顶部工具栏
    When 用户将鼠标悬停在阅读器顶部
    Then 应显示顶部工具栏

  @chrome
  Scenario: 悬停显示底部状态栏
    When 用户将鼠标悬停在阅读器底部
    Then 应显示底部状态栏

  @toc
  Scenario: 打开目录面板
    When 用户点击目录按钮
    Then 应显示目录面板
    And 目录面板应显示章节列表

  @toc
  Scenario: 从目录跳转到章节
    Given 目录面板已打开
    When 用户点击目录中的某一章节
    Then 阅读器应跳转到该章节

  @toc
  Scenario: 关闭目录面板
    Given 目录面板已打开
    When 用户点击目录面板的关闭按钮
    Then 目录面板应关闭

  @settings
  Scenario: 打开阅读设置面板
    When 用户点击字体设置按钮
    Then 应显示阅读设置面板

  @settings
  Scenario: 切换阅读模式为滚动
    Given 阅读设置面板已打开
    When 用户选择滚动阅读模式
    Then 阅读器应切换为滚动模式

  @settings
  Scenario: 切换阅读模式为分页
    Given 阅读设置面板已打开
    And 阅读模式为滚动
    When 用户选择分页阅读模式
    Then 阅读器应切换为分页模式

  @settings
  Scenario: 调整字体大小
    Given 阅读设置面板已打开
    When 用户调整字体大小滑块
    Then 阅读器字体大小应相应变化

  @settings
  Scenario: 调整页边距
    Given 阅读设置面板已打开
    When 用户调整页边距滑块
    Then 阅读器页边距应相应变化

  @settings
  Scenario: 切换字体
    Given 阅读设置面板已打开
    When 用户选择另一种字体
    Then 阅读器字体应切换

  @settings
  Scenario: 切换文本对齐方式
    Given 阅读设置面板已打开
    When 用户选择左对齐
    Then 阅读器文本应为左对齐

  @settings
  Scenario: 切换为双栏布局
    Given 阅读设置面板已打开
    When 用户选择双栏布局
    Then 阅读器应切换为双栏显示

  @settings
  Scenario: 切换为单栏布局
    Given 阅读设置面板已打开
    And 布局为双栏
    When 用户选择单栏布局
    Then 阅读器应切换为单栏显示

  @search
  Scenario: 搜索关键词并定位到结果
    When 用户点击搜索按钮
    And 用户输入搜索关键词 "Jane"
    Then 搜索结果应显示匹配条目
    When 用户点击某条搜索结果
    Then 阅读器应跳转到该关键词所在位置

  @search
  Scenario: 清空搜索恢复阅读状态
    Given 用户已执行搜索并显示结果
    When 用户清空搜索关键词
    Then 搜索结果应关闭
    And 阅读器应恢复阅读状态

  @bookmark
  Scenario: 添加书签
    When 用户点击书签按钮
    And 用户添加当前页为书签
    Then 书签面板应显示该书签

  @bookmark
  Scenario: 从书签跳转到对应位置
    Given 用户已添加书签
    When 用户点击书签面板中的某条书签
    Then 阅读器应跳转到该书签对应的位置

  @bookmark
  Scenario: 删除书签
    Given 用户已添加书签
    When 用户删除该书签
    Then 书签面板不再显示该书签
