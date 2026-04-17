import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ─── Embedded statusline.sh ───────────────────────────────────────────────────
// This script is written to ~/.claude/statusline.sh on activation.
// Claude Code CLI calls it on every prompt, piping a JSON payload via stdin.
// The script renders the terminal statusline AND writes a rate-cache.json
// that this VS Code extension reads for live rate limit data.

const STATUSLINE_VERSION = '7'; // bump when script changes to force re-write

const STATUSLINE_SCRIPT = (function() {
  const v = STATUSLINE_VERSION;
  const lines: string[] = [];
  const a = (s: string) => lines.push(s);

  a('#!/usr/bin/env bash');
  a('# Claude Statusline v' + v + ' — managed by Claude Statusline VS Code extension');
  a('# Do not edit manually; it will be overwritten on next activation.');
  a('payload=$(cat)');
  a('');
  a("reset='\\033[0m'; bold='\\033[1m'; dim='\\033[2m'");
  a("red='\\033[31m'; green='\\033[32m'; yellow='\\033[33m'");
  a("magenta='\\033[35m'; cyan='\\033[36m'");
  a('sep="${dim} │ ${reset}"');
  a('');
  a('# ── 1. Model ──────────────────────────────────────────────────────────────────');
  a("model=$(echo \"$payload\" | jq -r '.model.display_name // .model // \"Claude\"')");
  a('part_model="${magenta}${model}${reset}"');
  a('');
  a('# ── 2. Context window ────────────────────────────────────────────────────────');
  a("ctx_pct=$(echo \"$payload\" | jq -r '.context_window.used_percentage // 0')");
  a('ctx_int=$(printf "%.0f" "$ctx_pct")');
  a('filled=$(( ctx_int * 10 / 100 )); empty=$(( 10 - filled ))');
  a('bar=""');
  a('for ((i=0;i<filled;i++)); do bar+="█"; done');
  a('for ((i=0;i<empty;i++)); do bar+="░"; done');
  a('if   (( ctx_int >= 80 )); then ctx_color="$red"');
  a('elif (( ctx_int >= 50 )); then ctx_color="$yellow"');
  a('else                           ctx_color="$green"; fi');
  a('part_ctx="${ctx_color}${bar} ${ctx_int}%${reset}"');
  a('');
  a('# ── 3. Git branch ────────────────────────────────────────────────────────────');
  a("cwd=$(echo \"$payload\" | jq -r '.workspace.current_dir // .cwd // \"\"')");
  a('[[ -z "$cwd" ]] && cwd="$PWD"');
  a('part_git=""');
  a('if git -C "$cwd" rev-parse --is-inside-work-tree &>/dev/null; then');
  a('  branch=$(git -C "$cwd" symbolic-ref --short HEAD 2>/dev/null \\');
  a('        || git -C "$cwd" rev-parse --short HEAD 2>/dev/null)');
  a('  part_git="${green} ${branch}${reset}"');
  a('fi');
  a('');
  a('# ── 4 & 5. Rate limits ───────────────────────────────────────────────────────');
  a('rate_color() {');
  a('  local p; p=$(printf "%.0f" "$1")');
  a('  if   (( p >= 80 )); then printf "%s" "$red"');
  a('  elif (( p >= 50 )); then printf "%s" "$yellow"');
  a('  else                     printf "%s" "$green"; fi');
  a('}');
  a("r5=$(echo \"$payload\" | jq -r '.rate_limits.five_hour.used_percentage // 0')");
  a("r7=$(echo \"$payload\" | jq -r '.rate_limits.seven_day.used_percentage // 0')");
  a("r5_resets=$(echo \"$payload\" | jq -r 'if .rate_limits.five_hour.resets_at != null then .rate_limits.five_hour.resets_at else \"\" end')");
  a("r7_resets=$(echo \"$payload\" | jq -r 'if .rate_limits.seven_day.resets_at != null then .rate_limits.seven_day.resets_at else \"\" end')");
  a('part_r5="$(rate_color $r5)Session:$(printf "%.0f" $r5)%${reset}"');
  a('part_r7="$(rate_color $r7)Weekly:$(printf "%.0f" $r7)%${reset}"');
  a('');
  a('# ── 6. Session duration ──────────────────────────────────────────────────────');
  a("transcript=$(echo \"$payload\" | jq -r '.transcript_path // \"\"')");
  a('part_dur=""');
  a('if [[ -n "$transcript" && -e "$transcript" ]]; then');
  a('  btime=$(stat -f %B "$transcript" 2>/dev/null || stat -c %Z "$transcript" 2>/dev/null)');
  a('  if [[ -n "$btime" && "$btime" != "0" ]]; then');
  a('    elapsed=$(( $(date +%s) - btime ))');
  a('    hrs=$(( elapsed / 3600 )); mins=$(( (elapsed % 3600) / 60 ))');
  a('    if (( hrs > 0 )); then');
  a('      dur="${hrs}h $(printf "%02d" $mins)m"');
  a('    else');
  a('      dur="${mins}m"');
  a('    fi');
  a('    part_dur="${dim}${dur}${reset}"');
  a('  fi');
  a('fi');
  a('');
  a('# ── 7. Folder ────────────────────────────────────────────────────────────────');
  a('folder=$(basename "$cwd")');
  a('part_folder="${bold}${cyan}${folder}${reset}"');
  a('');
  a('# ── Write rate-cache.json for VS Code extension ──────────────────────────────');
  a('jq -n \\');
  a('  --argjson r5    "$(printf "%.0f" $r5)" \\');
  a('  --argjson r7    "$(printf "%.0f" $r7)" \\');
  a('  --arg     r5at  "$r5_resets" \\');
  a('  --arg     r7at  "$r7_resets" \\');
  a('  --argjson ctx   "$ctx_int" \\');
  a('  --arg     model "$model" \\');
  a('  --arg     cwd   "$cwd" \\');
  a('  --argjson ts    "$(date +%s)" \\');
  a("  '{r5:$r5,r7:$r7,r5_resets_at:$r5at,r7_resets_at:$r7at,context_pct:$ctx,model:$model,cwd:$cwd,ts:$ts}' \\");
  a('  > "$HOME/.claude/rate-cache.json" 2>/dev/null || true');
  a('');
  a('# ── Assemble and print ───────────────────────────────────────────────────────');
  a('line="$part_model${sep}$part_ctx"');
  a('[[ -n "$part_git" ]] && line+="${sep}$part_git"');
  a('line+="${sep}$part_r5${sep}$part_r7"');
  a('[[ -n "$part_dur" ]] && line+="${sep}$part_dur"');
  a('line+="${sep}$part_folder"');
  a('printf "%b\\n" "$line"');

  return lines.join('\n');
})();

// ─── Paths ────────────────────────────────────────────────────────────────────

const CLAUDE_DIR       = path.join(os.homedir(), '.claude');
const STATUSLINE_PATH  = path.join(CLAUDE_DIR, 'statusline.sh');
const SETTINGS_PATH    = path.join(CLAUDE_DIR, 'settings.json');
const RATE_CACHE_PATH  = path.join(CLAUDE_DIR, 'rate-cache.json');

// ─── Types ────────────────────────────────────────────────────────────────────

interface RateCache {
  r5: number;
  r7: number;
  r5_resets_at: string;
  r7_resets_at: string;
  context_pct: number;
  model: string;
  cwd: string;
  ts: number;
}

interface CacheResult {
  data: RateCache;
  stale: boolean;
}

interface StatusData {
  model: string;
  rawModel: string;
  contextPct: number;
  branch: string | null;
  r5Pct: number;
  r7Pct: number;
  r5ResetsAt: string | null;
  r7ResetsAt: string | null;
  sessionMin: number | null;
  folder: string;
  cwd: string;
  source: string;
  subscriptionType: string;
  claudeCodeInstalled: boolean;  // false = no CLI, show minimal status bar
  cacheStale: boolean;           // true = showing last known rate limit values
  rateLimitsAvailable: boolean;  // true = cache file exists (show Session/Weekly always)
}

// ─── Setup: write statusline.sh + register in settings.json ──────────────────

function ensureStatuslineScript(): void {
  // Only write if Claude Code CLI is installed (i.e. ~/.claude/ exists OR claude binary found)
  // Don't create ~/.claude/ for users who don't have Claude Code - it's confusing
  const claudeCliExists = fs.existsSync(CLAUDE_DIR) || !!which('claude');
  if (!claudeCliExists) { return; }

  try {
    fs.mkdirSync(CLAUDE_DIR, { recursive: true });

    // Check if already up-to-date
    let needsWrite = true;
    if (fs.existsSync(STATUSLINE_PATH)) {
      const existing = fs.readFileSync(STATUSLINE_PATH, 'utf8');
      if (existing.includes(`Claude Statusline v${STATUSLINE_VERSION}`)) {
        needsWrite = false;
      }
    }

    if (needsWrite) {
      fs.writeFileSync(STATUSLINE_PATH, STATUSLINE_SCRIPT, { mode: 0o755 });
    }

    // Ensure settings.json has the statusLine entry
    let settings: Record<string, unknown> = {};
    if (fs.existsSync(SETTINGS_PATH)) {
      try {
        settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
      } catch { /* start fresh */ }
    }

    const expected = { type: 'command', command: `bash ${STATUSLINE_PATH}` };
    const current = settings.statusLine as typeof expected | undefined;
    if (!current || current.type !== expected.type || current.command !== expected.command) {
      settings.statusLine = expected;
      fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
    }
  } catch (e) {
    console.error('Claude Statusline: failed to write statusline.sh:', e);
  }
}

function which(bin: string): string {
  try {
    return cp.execSync(`which ${bin} 2>/dev/null`, { timeout: 1000 }).toString().trim();
  } catch { return ''; }
}

// ─── Rate cache reader ────────────────────────────────────────────────────────

const CACHE_STALE_SECS = 120;      // fresh window: 2 minutes
const CACHE_DISCARD_SECS = 86400;  // discard after 24h (new day, new session)

function readRateCache(): CacheResult | null {
  try {
    if (!fs.existsSync(RATE_CACHE_PATH)) { return null; }
    const raw = fs.readFileSync(RATE_CACHE_PATH, 'utf8');
    const data = JSON.parse(raw) as RateCache;
    const age = Math.floor(Date.now() / 1000) - (data.ts || 0);
    if (age > CACHE_DISCARD_SECS) { return null; } // too old, discard
    return { data, stale: age > CACHE_STALE_SECS };
  } catch { return null; }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function exec(cmd: string): Promise<string> {
  return new Promise((resolve) => {
    cp.exec(cmd, { timeout: 3000 }, (err, stdout) => {
      resolve(err ? '' : stdout.trim());
    });
  });
}

function colorThreshold(pct: number): string {
  if (pct >= 80) { return '$(error)'; }
  if (pct >= 50) { return '$(warning)'; }
  return '';
}

function progressBar(pct: number, blocks = 10): string {
  const filled = Math.round((pct / 100) * blocks);
  // Use · as empty char — ░ renders nearly invisible in VS Code dark themes
  return '█'.repeat(filled) + '·'.repeat(blocks - filled);
}

function formatDuration(minutes: number): string {
  if (minutes < 60) { return `${minutes}m`; }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

function formatCountdown(isoOrEmpty: string | null): string {
  if (!isoOrEmpty) { return ''; }
  try {
    let ms: number;
    if (typeof isoOrEmpty === 'string' && /^\d+$/.test(isoOrEmpty)) {
      // Pure numeric string — treat as Unix seconds
      const n = parseInt(isoOrEmpty, 10);
      ms = (n < 1e10 ? n * 1000 : n) - Date.now();
    } else {
      ms = new Date(isoOrEmpty).getTime() - Date.now();
    }
    if (!isFinite(ms) || ms <= 0) { return ''; }
    const totalMins = Math.floor(ms / 60000);
    if (totalMins < 60) { return `${totalMins}m`; }
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return `${h}h${m > 0 ? ` ${m}m` : ''}`;
  } catch { return ''; }
}

function prettifyModelName(raw: string): string {
  if (!raw || raw === 'Claude') { return 'Claude'; }
  // Strip thinking-budget suffix like [1m], [32k], [2000] appended by Claude Code
  let s = raw.replace(/\[\d+[kmb]?\]$/i, '').trim();
  s = s.replace(/-\d{8}$/, '').replace(/-latest$/, '');
  s = s.replace(/^claude-/, '');
  const m = s.match(/^(sonnet|opus|haiku)-(\d+)(?:-(\d+))?/i);
  if (m) {
    const fam = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
    return m[3] ? `${fam} ${m[2]}.${m[3]}` : `${fam} ${m[2]}`;
  }
  return s.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
}

// ─── Transcript helpers ───────────────────────────────────────────────────────

function findTranscripts(cwd: string): string[] {
  const roots = [
    path.join(os.homedir(), '.claude', 'projects'),
    path.join(os.homedir(), '.config', 'claude', 'projects'),
  ];
  const files: { file: string; mtime: number; matchesCwd: boolean }[] = [];
  const cwdSeg = path.basename(cwd).toLowerCase();
  const walk = (dir: string) => {
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { walk(full); }
        else if (e.name.endsWith('.jsonl')) {
          const { mtimeMs } = fs.statSync(full);
          files.push({
            file: full, mtime: mtimeMs,
            matchesCwd: path.dirname(full).toLowerCase().includes(cwdSeg),
          });
        }
      }
    } catch { /* skip */ }
  };
  roots.forEach(walk);
  return files
    .sort((a, b) => (a.matchesCwd === b.matchesCwd ? b.mtime - a.mtime : a.matchesCwd ? -1 : 1))
    .map(f => f.file);
}

function parseTranscript(filePath: string): { rawModel: string; totalTokens: number; sessionMin: number | null } {
  let rawModel = '';
  let totalTokens = 0;
  let sessionMin: number | null = null;
  try {
    const stat = fs.statSync(filePath);
    const elapsed = Math.floor((Date.now() - stat.birthtimeMs) / 60000);
    sessionMin = elapsed > 0 ? elapsed : null;
    const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean);
    // Scan from end for model (usually in recent entries)
    for (let i = lines.length - 1; i >= 0 && !rawModel; i--) {
      try {
        const e = JSON.parse(lines[i]);
        const c = e.message?.model || e.model || null;
        if (c && typeof c === 'string' && c.startsWith('claude')) { rawModel = c; }
      } catch { continue; }
    }
    // Scan ALL entries for max token count (last entry = cumulative session total)
    for (let i = 0; i < lines.length; i++) {
      try {
        const e = JSON.parse(lines[i]);
        const u = e.usage || e.message?.usage;
        if (u) {
          const t = (u.input_tokens || 0) + (u.output_tokens || 0) +
            (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
          if (t > totalTokens) { totalTokens = t; }
        }
      } catch { continue; }
    }
  } catch { /* ignore */ }
  return { rawModel, totalTokens, sessionMin };
}

// ─── Subscription type from credentials ──────────────────────────────────────

function readSubscriptionType(): string {
  try {
    const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
    if (!fs.existsSync(credPath)) { return ''; }
    const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    return creds?.claudeAiOauth?.subscriptionType ?? '';
  } catch { return ''; }
}

// ─── Core data fetch ──────────────────────────────────────────────────────────

async function fetchStatusData(): Promise<StatusData> {
  const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();
  const folder = path.basename(cwd);

  // ── Rate limits: from rate-cache.json written by statusline.sh ───────────
  let r5Pct = 0, r7Pct = 0;
  let r5ResetsAt: string | null = null;
  let r7ResetsAt: string | null = null;
  let cachedModel = '';
  let cachedContextPct = 0;
  let source = 'none';

  const cacheResult = readRateCache();
  let cacheStale = false;
  if (cacheResult) {
    const cache = cacheResult.data;
    cacheStale       = cacheResult.stale;
    r5Pct            = cache.r5 || 0;
    r7Pct            = cache.r7 || 0;
    r5ResetsAt       = cache.r5_resets_at || null;
    r7ResetsAt       = cache.r7_resets_at || null;
    cachedModel      = cache.model || '';
    cachedContextPct = cache.context_pct || 0;
    source           = cacheStale ? 'rate-cache (stale)' : 'rate-cache';
  }

  // ── Model source priority: rate-cache > transcript > settings ───────────
  // rate-cache has the FULL versioned model name from live Claude Code payload
  // settings.json may have bare shorthand like "haiku" (no version number)
  let rawModel = '';

  // Source 1: rate-cache — most accurate, has full model string from live payload
  if (!rawModel && cachedModel && cachedModel !== 'Claude') {
    rawModel = cachedModel;
    source = 'rate-cache';
  }

  // Source 3: transcript JSONL
  let contextPct = cachedContextPct;
  let sessionMin: number | null = null;

  const transcripts = findTranscripts(cwd);

  // Check if the newest non-subagent transcript is a brand-new empty session
  // (created in the last 5 minutes with 0 tokens = fresh claude CLI just opened)
  const newestTranscript = transcripts.find(t => !t.includes('/subagents/'));
  if (newestTranscript) {
    const parsed0 = parseTranscript(newestTranscript);
    const isNewSession = parsed0.totalTokens === 0 &&
      parsed0.sessionMin !== null && parsed0.sessionMin < 5;
    if (isNewSession) {
      // Active new session — context is genuinely 0%, use its session time
      contextPct = 0;
      sessionMin = parsed0.sessionMin;
      source = 'new-session';
    }
  }

  // Only scan for model + tokens if not a fresh empty session
  for (const t of transcripts.slice(0, 20)) {
    if (t.includes('/subagents/')) { continue; }
    const parsed = parseTranscript(t);
    // Skip empty files UNLESS they are the active session (handled above)
    if (!parsed.rawModel && parsed.totalTokens === 0) { continue; }
    if (!rawModel && parsed.rawModel) {
      rawModel = parsed.rawModel;
      if (source === 'none') { source = 'transcript'; }
    }
    if (sessionMin === null) { sessionMin = parsed.sessionMin; }
    // Only use token count if we didn't detect a new session
    if (parsed.totalTokens > 0 && contextPct === 0 && source !== 'new-session') {
      contextPct = Math.min(100, Math.round((parsed.totalTokens / 200000) * 100));
    }
    if (rawModel) { break; }
  }

  // Source 3 (last resort): settings.json — only use if nothing better found
  // or if it has a versioned model string (contains a digit after family name)
  if (!rawModel) {
    try {
      if (fs.existsSync(SETTINGS_PATH)) {
        const s = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
        if (s.model && typeof s.model === 'string') {
          rawModel = s.model;
          source = 'settings';
        }
      }
    } catch { /* ignore */ }
  }

  // ── Git branch ────────────────────────────────────────────────────────────
  let branch: string | null = null;
  const gb = await exec(`git -C "${cwd}" symbolic-ref --short HEAD 2>/dev/null`);
  if (gb) { branch = gb; }
  else {
    const sha = await exec(`git -C "${cwd}" rev-parse --short HEAD 2>/dev/null`);
    if (sha) { branch = sha; }
  }

  const claudeCodeInstalled = fs.existsSync(CLAUDE_DIR) || !!which('claude');

  return {
    model: prettifyModelName(rawModel),
    rawModel,
    contextPct,
    branch,
    r5Pct,
    r7Pct,
    r5ResetsAt,
    r7ResetsAt,
    sessionMin,
    folder,
    cwd,
    source,
    subscriptionType: readSubscriptionType(),
    claudeCodeInstalled,
    cacheStale,
    rateLimitsAvailable: fs.existsSync(RATE_CACHE_PATH),
  };
}

// ─── Status bar ───────────────────────────────────────────────────────────────

function buildStatusText(data: StatusData, cfg: vscode.WorkspaceConfiguration): string {
  const parts: string[] = [];

  // No Claude Code CLI — show minimal useful info (git + folder)
  if (!data.claudeCodeInstalled) {
    if (cfg.get('showGitBranch') && data.branch) {
      parts.push(`$(sparkle) Claude  │  $(git-branch) ${data.branch}`);
    } else {
      parts.push(`$(sparkle) Claude`);
    }
    parts.push(`$(folder) ${data.folder}`);
    return parts.join('  │  ');
  }

  // Order: model | context | session usage | weekly limit | session reset | branch | folder | plan
  if (cfg.get('showModel')) {
    parts.push(`$(sparkle) ${data.model}`);
  }
  if (cfg.get('showContextBar')) {
    parts.push(`${colorThreshold(data.contextPct)}${progressBar(data.contextPct)} ${data.contextPct}%`);
  }
  if (cfg.get('showRateLimits') && data.rateLimitsAvailable) {
    const stale = data.cacheStale ? '~' : '';
    parts.push(`${colorThreshold(data.r5Pct)}Session:${stale}${data.r5Pct}%`);
    parts.push(`${colorThreshold(data.r7Pct)}Weekly:${stale}${data.r7Pct}%`);
    // Reset countdown for session window
    if (data.r5ResetsAt) {
      const reset = formatCountdown(data.r5ResetsAt);
      if (reset) { parts.push(`↻ ${reset}`); }
    }
  }
  if (cfg.get('showGitBranch') && data.branch) {
    parts.push(`$(git-branch) ${data.branch}`);
  }
  if (cfg.get('showSessionDuration') && data.sessionMin !== null) {
    parts.push(`$(clock) ${formatDuration(data.sessionMin)}`);
  }
  parts.push(`$(folder) ${data.folder}`);
  if (cfg.get('showSubscription') && data.subscriptionType) {
    const labels: Record<string, string> = { pro: 'Pro', team: 'Team', enterprise: 'Ent', free: 'Free' };
    parts.push(`$(verified) ${labels[data.subscriptionType] ?? data.subscriptionType}`);
  }
  return parts.join('  │  ');
}

function buildTooltip(data: StatusData): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.isTrusted = true;

  md.appendMarkdown(`## $(sparkle) Claude Statusline\n\n`);
  md.appendMarkdown(`| | |\n|---|---|\n`);
  md.appendMarkdown(`| **Model** | \`${data.model}\` |\n`);
  md.appendMarkdown(`| **Context** | ${colorThreshold(data.contextPct) || '🟢'} \`${progressBar(data.contextPct, 20)}\` **${data.contextPct}%** |\n`);
  if (data.branch) { md.appendMarkdown(`| **Branch** | \`${data.branch}\` |\n`); }
  if (data.rateLimitsAvailable) {
    const r5 = formatCountdown(data.r5ResetsAt);
    const r7 = formatCountdown(data.r7ResetsAt);
    const stale = data.cacheStale ? ' (~stale)' : '';
    md.appendMarkdown(`| **Session usage** | ${colorThreshold(data.r5Pct) || '🟢'} **${data.r5Pct}%**${r5 ? ` (resets in ${r5})` : ''}${stale} |\n`);
    md.appendMarkdown(`| **Weekly limit** | ${colorThreshold(data.r7Pct) || '🟢'} **${data.r7Pct}%**${r7 ? ` (resets in ${r7})` : ''}${stale} |\n`);
  }
  if (data.sessionMin !== null) { md.appendMarkdown(`| **Session** | ${formatDuration(data.sessionMin)} |\n`); }
  if (data.subscriptionType) { md.appendMarkdown(`| **Plan** | \`${data.subscriptionType}\` |\n`); }
  md.appendMarkdown(`| **Folder** | \`${data.cwd}\` |\n`);
  md.appendMarkdown(`| **Source** | \`${data.source}\` |\n`);

  if (!data.claudeCodeInstalled) {
    md.appendMarkdown(`\n> 💡 Install [Claude Code CLI](https://claude.ai/download) to unlock:\n`);
    md.appendMarkdown(`> context window usage · rate limits · session duration · model name\n\n`);
  } else {
    const cacheExists = fs.existsSync(RATE_CACHE_PATH);
    if (!cacheExists) {
      md.appendMarkdown(`\n> ⚠️ Rate limits show 0% — open Claude Code CLI once to activate live data\n\n`);
    } else if (data.cacheStale) {
      md.appendMarkdown(`\n> ℹ️ Showing last known values (~) — will refresh on next Claude Code prompt\n\n`);
    }
  }

  md.appendMarkdown(`\n---\n`);
  md.appendMarkdown(`[$(refresh) Refresh](command:claudeStatusline.refresh)   `);
  md.appendMarkdown(`[$(gear) Settings](command:claudeStatusline.openSettings)`);
  return md;
}

// ─── Activation ───────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
  // Write statusline.sh + register in settings.json immediately on activation
  ensureStatuslineScript();

  const cfg = vscode.workspace.getConfiguration('claudeStatusline');
  const alignment = cfg.get<string>('alignment') === 'right'
    ? vscode.StatusBarAlignment.Right
    : vscode.StatusBarAlignment.Left;

  const statusBar = vscode.window.createStatusBarItem(alignment, cfg.get<number>('priority') ?? 100);
  statusBar.text    = '$(sparkle) Claude…';
  statusBar.command = 'claudeStatusline.showDetails';
  statusBar.show();

  let lastData: StatusData | null = null;

  const refresh = async () => {
    try {
      const data = await fetchStatusData();
      lastData = data;
      const cfg2 = vscode.workspace.getConfiguration('claudeStatusline');
      statusBar.text    = buildStatusText(data, cfg2);
      statusBar.tooltip = buildTooltip(data);
      statusBar.backgroundColor = data.contextPct >= 80
        ? new vscode.ThemeColor('statusBarItem.errorBackground')
        : undefined;
    } catch (e) {
      statusBar.text    = '$(sparkle) Claude $(error)';
      statusBar.tooltip = `Error: ${e}`;
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeStatusline.refresh', refresh),

    vscode.commands.registerCommand('claudeStatusline.showDetails', () => {
      if (!lastData) { return; }
      vscode.window.showInformationMessage(
        [
          `Model: ${lastData.model}`,
          `Context: ${lastData.contextPct}%`,
          lastData.r5Pct > 0 || lastData.r5ResetsAt
            ? `Session: ${lastData.r5Pct}%${lastData.r5ResetsAt ? ` (resets in ${formatCountdown(lastData.r5ResetsAt)})` : ''}`
            : null,
          lastData.r7Pct > 0 || lastData.r7ResetsAt
            ? `Weekly: ${lastData.r7Pct}%${lastData.r7ResetsAt ? ` (resets in ${formatCountdown(lastData.r7ResetsAt)})` : ''}`
            : null,
          lastData.branch ? `Branch: ${lastData.branch}` : null,
          lastData.sessionMin !== null ? `Session: ${formatDuration(lastData.sessionMin)}` : null,
          lastData.subscriptionType ? `Plan: ${lastData.subscriptionType}` : null,
          `Source: ${lastData.source}`,
        ].filter(Boolean).join('\n')
      );
    }),

    vscode.commands.registerCommand('claudeStatusline.diagnose', async () => {
      const out = vscode.window.createOutputChannel('Claude Statusline Diagnostics');
      out.clear();
      out.appendLine('=== Claude Statusline v1.3.0 Diagnostics ===\n');

      // statusline.sh
      out.appendLine(`statusline.sh: ${STATUSLINE_PATH}`);
      out.appendLine(`  exists: ${fs.existsSync(STATUSLINE_PATH)}`);
      if (fs.existsSync(STATUSLINE_PATH)) {
        const content = fs.readFileSync(STATUSLINE_PATH, 'utf8');
        out.appendLine(`  version: ${content.match(/Claude Statusline v(\S+)/)?.[1] ?? 'unknown'}`);
        out.appendLine(`  up-to-date: ${content.includes(`Claude Statusline v${STATUSLINE_VERSION}`)}`);
      }

      out.appendLine('');
      out.appendLine(`settings.json: ${SETTINGS_PATH}`);
      if (fs.existsSync(SETTINGS_PATH)) {
        const s = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
        out.appendLine(`  statusLine: ${JSON.stringify(s.statusLine)}`);
      }

      out.appendLine('');
      out.appendLine(`rate-cache.json: ${RATE_CACHE_PATH}`);
      if (fs.existsSync(RATE_CACHE_PATH)) {
        const c = JSON.parse(fs.readFileSync(RATE_CACHE_PATH, 'utf8')) as RateCache;
        const age = Math.floor(Date.now() / 1000) - c.ts;
        out.appendLine(`  5h: ${c.r5}%  7d: ${c.r7}%`);
        out.appendLine(`  model: ${c.model}`);
        out.appendLine(`  age: ${age}s ${age > CACHE_STALE_SECS ? '(STALE)' : '(fresh)'}`);
      } else {
        out.appendLine('  NOT FOUND — open Claude Code CLI once to generate it');
        out.appendLine('  (statusline.sh will create it automatically on first use)');
      }

      out.appendLine('');
      out.appendLine(`Transcripts:`);
      const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();
      const ts = findTranscripts(cwd);
      out.appendLine(`  found: ${ts.length}`);
      ts.slice(0, 3).filter(t => !t.includes('/subagents/')).forEach(t => {
        const p = parseTranscript(t);
        out.appendLine(`  ${path.basename(t)}: model="${p.rawModel || 'not found'}" tokens=${p.totalTokens}`);
      });

      out.appendLine('\n=== Current display ===');
      if (lastData) {
        out.appendLine(`  Model: "${lastData.model}"  source: ${lastData.source}`);
        out.appendLine(`  5h: ${lastData.r5Pct}%  7d: ${lastData.r7Pct}%`);
        out.appendLine(`  Context: ${lastData.contextPct}%`);
      }
      out.show();
    }),

    vscode.commands.registerCommand('claudeStatusline.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'claudeStatusline');
    }),
  );

  refresh();
  const timer = setInterval(refresh, (cfg.get<number>('refreshInterval') ?? 5) * 1000);

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(refresh),
    vscode.window.onDidChangeActiveTextEditor(refresh),
    { dispose: () => clearInterval(timer) },
    statusBar,
  );
}

export function deactivate() {}
