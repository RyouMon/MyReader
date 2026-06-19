@regression @settings @folder-browser @navigation
Feature: 文件夹浏览器导航与操作
  作为一位 MyReader 用户
  我希望在 OneDrive 或 WebDAV 文件夹浏览器中自由浏览目录并完成选择
  这样我可以准确地定位并添加远程书库

  Background:
    Given 用户已打开添加书库面板
    And 已选择远程数据源
    And 文件夹浏览器已打开

  @smoke @navigation
  Scenario: 进入子目录
    When 用户点击某个文件夹
    Then 浏览器显示该文件夹内部的目录内容
    And 面包屑显示已进入该文件夹

  @navigation
  Scenario: 通过面包屑返回上级目录
    Given 用户已进入某个子目录
    When 用户点击面包屑中的上级目录名称
    Then 浏览器返回该上级目录
    And 面包屑同步更新

  @navigation
  Scenario: 通过返回按钮回到上级目录
    Given 用户已进入某个子目录
    When 用户点击返回按钮
    Then 浏览器返回该上级目录
    And 面包屑同步更新

  @navigation
  Scenario: 通过面包屑返回根目录
    Given 用户已进入某个子目录
    When 用户点击面包屑中的根目录
    Then 浏览器返回根目录
    And 面包屑只显示根目录

  @cancel
  Scenario: 取消选择关闭浏览器
    When 用户点击取消按钮
    Then 文件夹浏览器关闭
    And 书库路径输入框保持原有内容不变

  @close
  Scenario: 关闭按钮关闭浏览器
    When 用户点击关闭按钮
    Then 文件夹浏览器关闭
    And 书库路径输入框保持原有内容不变

  @select
  Scenario: 选择当前文件夹并回填路径
    Given 用户已进入某个子目录
    When 用户点击选择此文件夹按钮
    Then 文件夹浏览器关闭
    And 书库路径输入框显示该子目录路径

  @select @root
  Scenario: 选择根目录并回填路径
    When 用户点击选择此文件夹按钮
    Then 文件夹浏览器关闭
    And 书库路径输入框显示根目录路径
