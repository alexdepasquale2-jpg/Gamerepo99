# Keeps this folder and GitHub in step: commits everything here, pulls GitHub's changes, pushes.
# Task Scheduler runs it every 5 minutes (set up by scripts/install-sync.cmd). Log: .git/sync.log
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
$gitDir = Join-Path $repo '.git'
$log = Join-Path $gitDir 'sync.log'
function Log($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m" | Add-Content -Path $log }
function Run { $out = & git.exe @args 2>&1; $script:code = $LASTEXITCODE; return $out }

if ((Test-Path $log) -and (Get-Item $log).Length -gt 200KB) { Get-Content $log -Tail 500 | Set-Content $log }

# Never touch the repo mid-merge, mid-rebase, or off a branch.
foreach ($f in 'MERGE_HEAD', 'REBASE_HEAD', 'rebase-merge', 'rebase-apply', 'CHERRY_PICK_HEAD') {
  if (Test-Path (Join-Path $gitDir $f)) { Log "skip: $f in progress"; exit 0 }
}
$branch = Run branch --show-current | Select-Object -First 1
if (-not $branch) { Log 'skip: not on a branch'; exit 0 }
Run rev-parse --abbrev-ref '@{u}' | Out-Null
if ($code -ne 0) { Log "skip: $branch has no upstream"; exit 0 }

# 1. Commit everything changed here.
Run add -A | Out-Null
Run diff --cached --quiet | Out-Null
if ($code -ne 0) {
  $n = (Run diff --cached --name-only | Measure-Object).Count
  Run commit -q -m "Auto-sync from $env:COMPUTERNAME ($n files)" | Out-Null
  if ($code -ne 0) { Log 'commit failed'; exit 1 }
  Log "committed $n files on $branch"
}

# 2. Bring in GitHub's changes (a merge; history is never rewritten).
$out = Run pull --no-rebase --no-edit -q
if ($code -ne 0) {
  if (Test-Path (Join-Path $gitDir 'MERGE_HEAD')) {
    Run merge --abort | Out-Null
    Log "CONFLICT pulling $branch. Merge undone; your work is safe in a local commit. Fix by hand with: git pull"
  } else { Log "pull failed: $out" }
  exit 1
}

# 3. Send local commits up.
$ahead = Run rev-list --count '@{u}..HEAD' | Select-Object -First 1
if ([int]$ahead -gt 0) {
  $out = Run push -q
  if ($code -ne 0) { Log "push failed: $out"; exit 1 }
  Log "pushed $ahead commit(s) to $branch"
}
