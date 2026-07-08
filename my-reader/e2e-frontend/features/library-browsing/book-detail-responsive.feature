@regression @library-browsing @book-detail @responsive
Feature: 书籍详情响应式顶部栏
  作为 MyReader 用户
  我希望详情页顶部栏跟随详情面板宽度调整
  这样在窄详情面板中不会出现独立的顶部色块

  Background:
    Given 书库中已存在 20 本书

  Scenario: 分屏详情面板较窄时顶部栏透明覆盖在封面区上
    Given 用户在 1066 像素宽的窗口中打开第 1 本书的详情页
    Then 详情页封面区应从详情面板顶部开始
    And 详情页顶部栏应保持透明
