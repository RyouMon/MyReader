@regression @settings @folder-browser @layout
Feature: 文件夹浏览器超长路径布局
  作为一位 MyReader 用户
  我希望在 OneDrive 或 WebDAV 中选择深层次的文件夹时
  浏览器弹窗能够保持固定宽度、路径信息不会被截断到看不见按钮
  这样我可以安全地确认当前选中的文件夹

  Background:
    Given 用户已打开添加书库面板
    And 已选择远程数据源

  @smoke @long-path
  Scenario: 超长文件夹名称在列表中被截断
    When 打开文件夹浏览器
    And 当前目录包含名称很长的文件夹
    Then 文件夹列表保持完整显示
    And 每个超长文件夹名称都以省略号截断末尾
    And 文件夹名称开头部分保持可见
    And 文件夹列表不超出弹窗边界

  @long-path
  Scenario: 超长路径的面包屑保留末尾关键路径
    When 打开文件夹浏览器
    And 用户进入层次很深的目录
    Then 面包屑显示省略号以折叠中间路径
    And 面包屑末尾目录名称保持可见
    And 工具栏不超出弹窗边界

  @long-path @critical
  Scenario: 点击省略号可查看并跳转到被折叠的中间路径
    When 打开文件夹浏览器
    And 用户进入层次很深的目录
    And 用户点击面包屑省略号
    Then 省略号菜单显示被折叠的中间路径
    When 用户点击省略号菜单中的第一个路径
    Then 浏览器显示被折叠路径对应的目录内容
    And 面包屑显示已跳转到被折叠路径

  @long-path @critical
  Scenario: 已选择路径过长时完整换行显示
    When 打开文件夹浏览器
    And 用户进入层次很深的目录
    Then 底部已选择路径完整显示
    And 路径过长时允许换行显示
    And "选择此文件夹" 按钮完整可见
    And 底部操作栏不超出弹窗边界

  @viewport @long-path
  Scenario Outline: 不同窗口宽度下超长路径弹窗保持正常布局
    When 在设置页面将窗口宽度调整为 <viewport_width> 像素
    And 打开文件夹浏览器
    And 用户进入层次很深的目录
    Then 弹窗宽度不超过窗口宽度
    And 弹窗内不出现横向滚动条

    Examples:
      | viewport_width |
      | 400            |
      | 800            |
      | 1280           |
