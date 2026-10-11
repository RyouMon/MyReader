@regression @library-browsing @book-detail @responsive
Feature: 书籍详情响应式顶部栏
  作为 MyReader 用户
  我希望详情操作统一放在窗口标题栏中
  这样在窄详情面板中也能直接操作

  Background:
    Given 书库中已存在 20 本书

  Scenario: 分屏详情面板较窄时操作保留在窗口标题栏中
    Given 用户在 1066 像素宽的窗口中打开第 1 本书的详情页
    Then 详情页封面区应从详情面板顶部开始
    And 详情操作应显示在窗口标题栏中

  Scenario: 窄分屏中搜索弹层显示在窗口内
    Given 用户在 700 像素宽的窗口中打开第 1 本书的详情页
    When 用户打开标题栏的紧凑搜索
    Then 搜索弹层应显示在窗口内并接受输入

  Scenario: 宽屏详情封面背景贯穿内容区并随详情关闭
    Given 用户在 1600 像素宽的窗口中打开第 1 本书的详情页
    Then 封面背景应覆盖整个列表和详情内容区
    When 用户关闭书籍详情页
    Then 书库不应保留详情封面背景

  Scenario: 调整窗口宽度时封面背景跟随详情布局
    Given 用户在 1600 像素宽的窗口中打开第 1 本书的详情页
    When 窗口宽度调整为 1066 像素
    Then 封面背景应限制在详情面板内
    When 窗口宽度调整为 1600 像素
    Then 封面背景应覆盖整个列表和详情内容区
