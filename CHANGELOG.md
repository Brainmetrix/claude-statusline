# Changelog

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
