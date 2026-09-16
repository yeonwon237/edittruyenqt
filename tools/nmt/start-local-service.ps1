param(
    [Parameter(Mandatory = $true)][string]$PythonPath,
    [Parameter(Mandatory = $true)][string]$ModelsDir,
    [string]$PronounClassifierDir = "",
    [int]$Port = 8787
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Test-Path -LiteralPath $PythonPath)) { throw "Python runtime not found: $PythonPath" }
if (-not (Test-Path -LiteralPath $ModelsDir)) { throw "Model directory not found: $ModelsDir" }

$env:NMT_MODELS_DIR = (Resolve-Path -LiteralPath $ModelsDir).Path
if ($PronounClassifierDir -and (Test-Path -LiteralPath $PronounClassifierDir)) {
    $env:NMT_PRONOUN_CLF_DIR = (Resolve-Path -LiteralPath $PronounClassifierDir).Path
}
$env:NMT_PORT = [string]$Port
$env:PYTHONIOENCODING = 'utf-8'
Set-Location -LiteralPath $scriptDir
& $PythonPath (Join-Path $scriptDir 'server.py')
