@regression @settings
Feature: Settings Page

  Background:
    Given the user is on the settings page

  @smoke
  Scenario: Display current library management UI
    Then the page heading should show "书库管理"
    And the add library button should be visible

  Scenario: Navigate to settings from sidebar
    Given the user is on the home page
    When the user clicks the settings link in the sidebar
    Then the user should be on the settings page
