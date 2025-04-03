# Changelog

All notable changes to this project will be documented in this file.

---

## [Unreleased]

### Added
- **Command Enhancements**:
  - `/setup`: Added support for configuring error channels by category (`runtime`, `api`, `validation`, `general`). The bot can now create these channels automatically if they do not exist.
  - `/config`: Added stricter validation for configuration keys and values. Introduced a subcommand to reset configurations to default values.
  - `/clearmemory`: Added a preview option to show what will be cleared before execution. Confirmation messages now summarize the number of messages cleared.
  - `/delete`: Added a confirmation message summarizing the number of messages deleted. Introduced a subcommand to delete messages by a specific user.
  - `/memoryprune`: Added a confirmation message indicating when the pruning interval will take effect. Introduced a subcommand to disable memory pruning temporarily.
  - `/status`: Added details about the number of servers the bot is connected to. Included a breakdown of memory usage by category (e.g., heap, external).
  - `/help`: Added examples for each command in the help message. Introduced a search feature to filter commands by name or category.
  - `/summarize`: Added rate limiting to prevent abuse. Provided feedback if the summary is too long or if no messages are available to summarize.
  - `/joke`: Added caching to reduce API calls. Introduced a fallback joke in case the API fails.
  - `/quote`: Added caching and fallback options. Introduced a subcommand to fetch quotes by category (e.g., inspirational, funny).
  - `/poll`: Added a subcommand to close the poll manually and display the results. Introduced a feature to allow anonymous voting.
  - `/remind`: Added a subcommand to list all active reminders. Introduced a feature to cancel a reminder before it is executed.
  - `/weather`: Added a subcommand to fetch a 7-day weather forecast. Introduced a feature to save favorite locations for quick access.

- **Performance Improvements**:
  - Implemented caching for frequently accessed data (e.g., jokes, quotes, weather) to reduce latency.
  - Optimized file I/O by batching memory saves to reduce the frequency of file writes.
  - Used asynchronous execution (`Promise.all`) to execute multiple API calls in parallel.
  - Preloaded commands and events during startup to reduce runtime overhead.

- **Error Handling**:
  - Added detailed error messages for API failures and invalid inputs.
  - Introduced error notifications for admins in specific channels if an API fails repeatedly.

- **Logging Enhancements**:
  - Improved logging efficiency by limiting debug logs in production.
  - Added structured logging for better categorization (`info`, `error`, `debug`, `runtime`, etc.).
  - Introduced daily log rotation with retention policies for each log category.

- **Documentation**:
  - Updated the README to include examples and troubleshooting steps for all commands.
  - Added detailed descriptions for core functions and logging mechanisms.

### Changed
- **Code Quality**:
  - Refactored repeated logic (e.g., input validation, error handling) into utility functions for better maintainability.
  - Improved modularity and consistency across all commands and events.
  - Enhanced naming conventions for better readability and clarity.

- **Command Behavior**:
  - `/delete`: Improved rate limiting to prevent abuse.
  - `/clearmemory`: Added validation for duration values to ensure they are greater than 0.
  - `/memoryprune`: Updated the global memory pruning interval to support both days and hours.

### Fixed
- **Bug Fixes**:
  - Resolved issues with invalid JSON handling in memory files.
  - Fixed potential race conditions in memory saving and pruning operations.
  - Addressed edge cases where API responses could cause unexpected errors.

---

## [1.0.0] - Initial Release

- Initial release of the Milena bot with core functionalities, including:
  - Memory management
  - API integration (Gemini, JokeAPI, ZenQuotes, OpenWeatherMap)
  - Command handling and event management
  - Logging and error handling
  - Configuration and setup commands