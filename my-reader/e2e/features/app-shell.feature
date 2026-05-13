@regression @desktop @smoke
Feature: Application Shell

  Background:
    Given the application is loaded

  Scenario: Display application branding
    Then the branding text "MyReader" should be visible

  Scenario: Navigate to settings from sidebar
    When the user clicks the settings link in the sidebar
    Then the settings page heading "书库管理" should be displayed
