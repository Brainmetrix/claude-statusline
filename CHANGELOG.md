# Changelog

## [1.1.0] — 2026-04-19

### Added
- **OAuth API Support**: Direct API integration with `api.anthropic.com/api/oauth/usage` for fetching fresh rate limits
- **Three-Tier Data Pipeline**: Prioritized data sources (rate-cache → OAuth API → stale cache) for improved reliability
- **OAuth Credentials Support**: Reads OAuth tokens from `~/.claude/.credentials.json` for API authentication
- **API Caching**: 60-second in-memory cache for OAuth API requests to minimize redundant calls
- **Enhanced Session Detection**: Improved logic to detect new Claude Code sessions based on transcript timestamps
- **Better Context Estimation**: More accurate context percentage calculation from cumulative token usage

### Improved
- **Data Source Fallback Chain**: Gracefully falls back from live cache to OAuth API to stale cache
- **Diagnostics Command**: Added OAuth API connectivity test to debug output
- **Error Handling**: Better error handling for missing or invalid credentials
- **Code Organization**: Refactored for better maintainability and performance

### Fixed
- **Model Extraction**: Enhanced `.model.id` fallback for edge cases where display_name is unavailable
- **Timestamp Handling**: Improved Unix timestamp parsing for countdown calculations
- **New Session Detection**: More accurate detection when transcript is created after last cache update

---

## [1.0.0] — 2026-04-18

### Added
- Status bar: model name, context window bar, session usage, weekly limit, reset countdown, git branch, folder, plan badge
- Automatic `~/.claude/statusline.sh` setup — no manual configuration required
- Live rate limits from Claude Code CLI payload via `~/.claude/rate-cache.json`
- Graceful degradation when Claude Code CLI is not installed
- Stale cache indicator (`~` prefix) when data is >2 minutes old
- New session detection — context resets to 0% when a new Claude Code terminal is opened
- Model name prettifier handles all variants: `claude-sonnet-4-6-20250514` → `Sonnet 4.6`
- Diagnostic command (`Claude Statusline: Run Diagnostics`) for troubleshooting
- Configurable segments, alignment, refresh interval
- Subscription plan badge (Pro / Team / Max)
