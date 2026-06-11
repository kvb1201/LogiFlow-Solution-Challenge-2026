$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

$activate = Join-Path $PSScriptRoot "venv\Scripts\Activate.ps1"
if (Test-Path $activate) {
    . $activate
}

$envFile = Join-Path $PSScriptRoot ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
            return
        }

        $separator = $line.IndexOf("=")
        $name = $line.Substring(0, $separator)
        $value = $line.Substring($separator + 1)
        [Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim(), "Process")
    }
}

$python = Join-Path $PSScriptRoot "venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    $python = "python"
}

& $python -m uvicorn app.main:app --reload --reload-dir app --host 127.0.0.1 --port 8000
