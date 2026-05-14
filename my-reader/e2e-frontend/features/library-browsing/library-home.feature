@smoke @regression @library-browsing
Feature: 书库首页

  Scenario: 用户打开应用首页
    Given 用户访问书库首页
    Then 页面应该显示应用标题 "MyReader"
    And 页面应该显示主内容区域
