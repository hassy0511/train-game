param(
    [switch]$CheckOnly,
    [switch]$SkipUvInstall,
    [switch]$SkipCodexRegistration,
    [switch]$SkipAddonInstall,
    [string]$UvVersion = '0.12.13'
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Resolve-LocalTool([string]$Name) {
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $candidate = Join-Path $env:USERPROFILE ".local\bin\$Name.exe"
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
        return $candidate
    }

    return $null
}

function Resolve-CodexCli {
    $configPath = Join-Path $env:USERPROFILE '.codex\config.toml'
    if (Test-Path -LiteralPath $configPath) {
        $match = Select-String -LiteralPath $configPath -Pattern '^CODEX_CLI_PATH\s*=\s*["''](.+)["'']' -Encoding utf8 |
            Select-Object -Last 1
        if ($match -and (Test-Path -LiteralPath $match.Matches[0].Groups[1].Value -PathType Leaf)) {
            return $match.Matches[0].Groups[1].Value
        }
    }

    return Resolve-LocalTool 'codex'
}

function Invoke-Uvx([string[]]$Arguments) {
    & $script:UvxPath --system-certs --python 3.11 --no-python-downloads @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "uvx failed with exit code $LASTEXITCODE"
    }
}

Write-Host 'Blender MCP setup for Codex (Windows)' -ForegroundColor Green
Write-Host 'Community bridge: ahujasid/blender-mcp'

$script:UvxPath = Resolve-LocalTool 'uvx'
$codexCli = Resolve-CodexCli
$blenderCommand = Resolve-LocalTool 'blender'

Write-Step 'Current environment'
Write-Host ("codex:  " + $(if ($codexCli) { $codexCli } else { 'NOT FOUND' }))
Write-Host ("uvx:    " + $(if ($script:UvxPath) { $script:UvxPath } else { 'NOT FOUND' }))
Write-Host ("blender:" + $(if ($blenderCommand) { " $blenderCommand" } else { ' NOT FOUND' }))

if ($CheckOnly) {
    if ($codexCli) { & $codexCli mcp list }
    if ($script:UvxPath) {
        $env:DISABLE_TELEMETRY = 'true'
        $env:UV_SYSTEM_CERTS = 'true'
        Invoke-Uvx @('blender-mcp', 'addon-paths')
    }
    exit 0
}

if (-not $script:UvxPath) {
    if ($SkipUvInstall) {
        throw 'uvx is missing and -SkipUvInstall was specified.'
    }

    Write-Step "Installing uv $UvVersion from Astral"
    $installerPath = Join-Path $env:TEMP "uv-install-$UvVersion.ps1"
    Invoke-WebRequest -Uri "https://astral.sh/uv/$UvVersion/install.ps1" -OutFile $installerPath
    powershell -NoProfile -ExecutionPolicy Bypass -File $installerPath
    $script:UvxPath = Resolve-LocalTool 'uvx'
    if (-not $script:UvxPath) {
        throw 'uv installation completed but uvx.exe could not be resolved.'
    }
}

$uvPath = Resolve-LocalTool 'uv'
if (-not $uvPath) {
    throw 'uv.exe could not be resolved after uvx was found.'
}

Write-Step 'Ensuring uv-managed Python 3.11'
& $uvPath --system-certs python install 3.11
if ($LASTEXITCODE -ne 0) {
    throw 'uv could not install or verify Python 3.11.'
}

$env:DISABLE_TELEMETRY = 'true'
$env:UV_SYSTEM_CERTS = 'true'
$env:UV_PYTHON_PREFERENCE = 'only-managed'

if (-not $SkipCodexRegistration) {
    if (-not $codexCli) {
        throw 'Codex CLI could not be resolved. Inspect CODEX_CLI_PATH in the Codex config.'
    }

    Write-Step 'Checking Codex MCP registration'
    $mcpList = (& $codexCli mcp list 2>&1 | Out-String)
    if ($mcpList -match '(?im)^\s*blender\s+') {
        Write-Host 'A blender MCP entry already exists; leaving it unchanged.' -ForegroundColor Yellow
    } else {
        & $codexCli mcp add blender `
            --env DISABLE_TELEMETRY=true `
            --env UV_SYSTEM_CERTS=true `
            --env UV_PYTHON_PREFERENCE=only-managed `
            -- $script:UvxPath --python 3.11 --no-python-downloads blender-mcp
        if ($LASTEXITCODE -ne 0) {
            throw 'codex mcp add failed.'
        }
    }
}

if (-not $SkipAddonInstall) {
    Write-Step 'Installing or updating the Blender MCP add-on'
    Invoke-Uvx @('blender-mcp', 'install-addon')
}

Write-Step 'Verification summary'
if ($codexCli) { & $codexCli mcp list }
Invoke-Uvx @('blender-mcp', 'addon-paths')

Write-Host "`nMachine-side setup is complete." -ForegroundColor Green
Write-Host 'Open Blender with its normal GUI. Enable Interface: MCP for Blender if needed.'
Write-Host 'Confirm 127.0.0.1:9876 is listening, then restart Codex and run a read-only get_scene_info call.'
