# Claude Statusline

> Claude Code context, model, session usage, weekly limit, git branch — right in your VS Code status bar. Zero setup required.

```
✨ Sonnet 4.6  │  ██········ 13%  │  Session:6%  │  Weekly:19%  │  ↻ 1h 26m  │  ⎇ main  │  📁 my-project  │  ⊙ Team
```

---

## What it shows

| Segment | Description |
|---|---|
| `✨ Sonnet 4.6` | Current Claude model |
| `██········ 13%` | Context window usage (green → yellow → red) |
| `Session:6%` | 5-hour rolling session usage |
| `Weekly:19%` | 7-day weekly usage |
| `↻ 1h 26m` | Time until session limit resets |
| `⎇ main` | Git branch of workspace |
| `📁 my-project` | Current workspace folder |
| `⊙ Team` | Subscription plan |

Colors follow green → yellow → red at 50% and 80% thresholds.

---

## Requirements

- VS Code 1.85+
- [Claude Code CLI](https://claude.ai/install) (optional — git branch + folder always work without it)

---

## Setup

**Install the extension. That's it.**

On first activation, the extension:
1. Writes `~/.claude/statusline.sh` (Claude Code's statusline hook)
2. Registers it in `~/.claude/settings.json`
3. Starts reading live data on your next Claude Code prompt

No manual configuration needed.

### Without Claude Code CLI

The extension still shows:
```
✨ Claude  │  ⎇ main  │  📁 my-project
```
Hover the status bar item for a link to install Claude Code CLI and unlock all segments.

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `claudeStatusline.refreshInterval` | `5` | Refresh every N seconds (2–60) |
| `claudeStatusline.showModel` | `true` | Show model name |
| `claudeStatusline.showContextBar` | `true` | Show context window bar |
| `claudeStatusline.showRateLimits` | `true` | Show Session/Weekly usage |
| `claudeStatusline.showGitBranch` | `true` | Show git branch |
| `claudeStatusline.showSessionDuration` | `true` | Show session duration |
| `claudeStatusline.showSubscription` | `true` | Show plan badge |
| `claudeStatusline.alignment` | `"left"` | `"left"` or `"right"` |
| `claudeStatusline.priority` | `100` | Status bar priority |

---

## Commands

- **Claude Statusline: Refresh Now** — Force refresh
- **Claude Statusline: Show Details** — Quick detail popup
- **Claude Statusline: Run Diagnostics** — Debug output channel
- **Claude Statusline: Open Settings** — Jump to settings

---

## How it works

The extension writes a `statusline.sh` script that Claude Code CLI calls on every prompt, piping live JSON (model, context %, rate limits, session info). The script renders the terminal statusline and simultaneously writes `~/.claude/rate-cache.json`. The VS Code extension reads this cache file every 5 seconds for live data.

When the cache is stale (>2 min since last CLI prompt), values show with a `~` prefix. When a new Claude Code session is detected (transcript newer than cache), context resets to 0%.

---

## License

MIT © [Vivek Singh Rajput](https://github.com/Brainmetrix)
