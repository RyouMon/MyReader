@regression @reader @tts
Feature: 桌面阅读时协调朗读位置和可视页面
  作为一边看书一边听书的读者
  我希望浏览页面不会抢走朗读位置
  以便自由查看正文，也能准确选择新的朗读起点

  Background:
    Given 小文已打开支持跨页句子的测试书籍

  Rule: 朗读只响应明确的播放操作
    Scenario: 展开听书控制不自动播放
      When 小文展开听书控制
      Then 朗读未开始且可以手动播放

    Scenario: 播放从当前页的第一条可见文字开始
      Given 小文已展开听书控制
      When 小文开始朗读
      Then 正在朗读 "TTS verification"

    Scenario: 暂停保留当前语句
      Given 小文正在朗读 "TTS verification"
      When 小文暂停朗读
      Then 朗读暂停且保留当前语句

    Scenario: 继续播放不重新请求语句
      Given 小文已暂停朗读 "TTS verification"
      When 小文继续朗读
      Then 朗读恢复且语句未重新播放

    Scenario: 下一句只前进一条语句
      Given 小文正在朗读 "TTS verification"
      When 小文播放下一句
      Then 正在朗读 "MyReader reads this first sentence aloud."

    Scenario: 上一句只后退一条语句
      Given 小文正在朗读 "MyReader reads this first sentence aloud."
      When 小文播放上一句
      Then 正在朗读 "TTS verification"

    Scenario: 停止朗读收起控制
      Given 小文正在朗读 "TTS verification"
      When 小文停止朗读
      Then 朗读已停止且听书控制收起

    Scenario: 普通点击正文不改变朗读位置
      Given 小文正在朗读 "TTS verification"
      When 小文点击正文中的第二句话
      Then 朗读继续原来的语句

    Scenario: 选择正文不自动开始朗读
      When 小文选择正文中的第二句话
      Then 正文保持选中且朗读未开始

    Scenario: 通过选择菜单从选中文字开始朗读
      Given 小文已选择正文中的第二句话
      When 小文选择从此处朗读
      Then 正在朗读 "Long-press this second sentence and choose Read from here."

  Rule: 浏览页面不改变朗读位置
    Scenario: 浏览到朗读位置之后
      Given 小文正在朗读 "TTS verification"
      When 小文浏览到 "Playback lifecycle"
      Then 朗读继续原来的语句
      And 左侧可以返回朗读位置，右侧可以从当前页朗读

    Scenario: 同一章节的第一页后方也属于向前浏览
      Given 小文正在朗读 "Playback position first page"
      When 小文向后翻一页
      Then 阅读画布保持在窗口内
      And 左侧可以返回朗读位置，右侧可以从当前页朗读

    Scenario: 浏览到朗读位置之前
      Given 小文正在朗读 "Playback position first page"
      When 小文浏览到 "TTS verification"
      Then 朗读继续原来的语句
      And 左侧可以从当前页朗读，右侧可以返回朗读位置

    Scenario: 返回朗读位置只改变可视页面
      Given 小文正在朗读 "TTS verification"，但正在查看 "Playback lifecycle"
      When 小文返回朗读位置
      Then 当前页显示 "TTS verification"
      And 朗读继续原来的语句且恢复上一句和下一句

    Scenario: 选择当前页作为新的朗读起点
      Given 小文正在朗读 "TTS verification"，但正在查看 "Playback lifecycle"
      When 小文从当前页朗读
      Then 正在朗读以 "Playback lifecycle anchor" 开头的语句
      And 当前页显示 "Playback lifecycle"

    Scenario: 暂停后也能选择新的朗读起点
      Given 小文已暂停朗读 "TTS verification"，但正在查看 "Playback lifecycle"
      When 小文从当前页朗读
      Then 正在朗读以 "Playback lifecycle anchor" 开头的语句

    Scenario: 当前页重启后的下一句不回到书首
      Given 小文已从 "Playback lifecycle" 重启朗读
      When 当前语句朗读结束
      Then 正在朗读以 "Playback lifecycle second anchor" 开头的语句
      And 当前页显示 "Playback lifecycle"

    Scenario: 停止后重新播放使用新浏览的页面
      Given 小文已停止朗读，并正在查看 "Playback lifecycle"
      When 小文重新打开听书并开始朗读
      Then 正在朗读以 "Playback lifecycle anchor" 开头的语句

    Scenario: 导航与语句结束同时发生时仍保留浏览页面
      Given 小文正在朗读 "TTS verification"
      When 小文浏览到 "Playback lifecycle" 时当前语句恰好结束
      Then 当前页显示 "Playback lifecycle"
      And 朗读继续到下一句且仍可返回朗读位置

    Scenario: 没有手动浏览时朗读自动进入下一章节
      Given 小文正在朗读 "Playback lifecycle"
      When 当前章节朗读完毕
      Then 当前页显示 "Playback position first page"
      And 恢复上一句和下一句

  Rule: 跨页句子的可见片段属于当前页
    Scenario: 浏览到正在朗读的句子的后半段
      Given 小文正在朗读跨页句子
      When 小文浏览到该句的下一页片段
      Then 恢复上一句和下一句

    Scenario: 当前页的起点是跨页句子的可见片段
      Given 小文正在朗读 "TTS verification"，但正在查看 "Sentence boundary visible page"
      When 小文从当前页朗读
      Then 正在朗读 "Visible fragment completes the first sentence."
      And 当前页显示 "Visible fragment completes the first sentence."

  Rule: 无法播放时提供明确反馈而不是错误推进位置
    Scenario: 语音服务报告播放失败
      Given 小文正在朗读 "TTS verification"
      When 语音服务报告播放失败
      Then 显示朗读失败提示且可以重新播放

    Scenario: 新语音未开始就结束时不回到书首
      Given 小文正在朗读 "TTS verification"，但正在查看 "Playback lifecycle"
      And 语音服务会在新语句开始前错误地报告结束
      When 小文从当前页朗读
      Then 显示朗读失败提示且可以重新播放
      And 当前页显示 "Playback lifecycle"
