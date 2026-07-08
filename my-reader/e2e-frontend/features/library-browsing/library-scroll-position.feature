@regression @library-browsing @scroll-position @resize
Feature: 书库滚动位置稳定性
  作为一位 MyReader 用户
  我希望布局变化时书库列表保持我正在看的位置
  这样我可以继续从原来的书籍开始浏览

  Background:
    Given 书库中已存在 200 本书

  Rule: 正常浏览时顶部可见书籍保持稳定

    @grid-view
    Scenario Outline: 网格视图调整窗口宽度后顶部第一本书保持在顶部行
      Given 用户正在 <initial_width> 像素宽的网格视图中从第 <book_number> 本书所在行开始浏览
      When 窗口宽度调整为 <resized_width> 像素
      Then 页面顶部第一行应包含调整前位于顶部第一行的第一本书

      Examples:
        | book_number | initial_width | resized_width |
        | 40          | 1280          | 900           |
        | 40          | 900           | 1280          |

    @grid-view
    Scenario: 网格视图连续调整窗口宽度期间顶部第一本书保持在顶部行
      Given 用户正在 1280 像素宽的网格视图中从第 80 本书所在行开始浏览
      When 窗口宽度依次调整为:
        | width |
        | 1180  |
        | 980   |
        | 1360  |
        | 1040  |
      Then 页面顶部第一行应包含调整前位于顶部第一行的第一本书

  Rule: 详情布局变化时选中书籍保持视觉位置

    @detail @selected-book-anchor
    Scenario Outline: 打开详情后选中书籍保持原来的垂直位置
      Given 用户正在 1280 像素宽的网格视图中浏览书库
      And 第 <selected_book> 本书中心位于可见区域高度的 <anchor_percent>% 处
      When 用户打开第 <selected_book> 本书的详情页
      Then 第 <selected_book> 本书中心仍应接近书库列表可见区域高度的 <anchor_percent>% 处

      Examples:
        | selected_book | anchor_percent |
        | 40            | 20             |
        | 80            | 50             |
        | 120           | 80             |

    @detail @selected-book-anchor
    Scenario Outline: 详情打开期间调整窗口宽度后选中书籍保持原来的垂直位置
      Given 用户已在网格视图中打开第 <selected_book> 本书的详情页
      And 第 <selected_book> 本书中心位于书库列表可见区域高度的 <anchor_percent>% 处
      When 窗口宽度调整为 <resized_width> 像素
      Then 第 <selected_book> 本书中心仍应接近书库列表可见区域高度的 <anchor_percent>% 处

      Examples:
        | selected_book | anchor_percent | resized_width |
        | 40            | 20             | 1040          |
        | 80            | 50             | 1040          |
        | 120           | 80             | 1040          |

    @detail @selected-book-anchor
    Scenario Outline: 关闭详情后选中书籍保持原来的垂直位置
      Given 用户已在网格视图中打开第 <selected_book> 本书的详情页
      And 第 <selected_book> 本书中心位于书库列表可见区域高度的 <anchor_percent>% 处
      When 用户关闭书籍详情页
      Then 第 <selected_book> 本书中心仍应接近书库列表可见区域高度的 <anchor_percent>% 处

      Examples:
        | selected_book | anchor_percent |
        | 40            | 20             |
        | 80            | 50             |
        | 120           | 80             |
