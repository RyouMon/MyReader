@regression @reader @epub-theme
Feature: EPUB 阅读主题
  作为 MyReader 用户
  我希望 EPUB 正文始终使用所选阅读主题
  这样书籍自带样式不会让正文退回白底黑字

  Scenario: Night 主题覆盖 EPUB 的内联白底黑字样式
    Given EPUB 正文声明了内联白底黑字样式
    When 阅读器对正文应用 Night 主题
    Then EPUB 正文应显示 Night 主题的前景色和背景色
