param(
    [Parameter(Mandatory = $true)][string]$PythonPath,
    [Parameter(Mandatory = $true)][string]$ModelsDir,
    [string]$PronounClassifierDir = "",
    [string]$TaskName = 'EditTruyenQT Local Translator'
)

$ErrorActionPreference = 'Stop'
$startScript = Join-Path $PSScriptRoot 'start-local-service.ps1'
foreach ($path in @($startScript, $PythonPath, $ModelsDir)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Required path not found: $path" }
}

$quotedStart = '"' + $startScript + '"'
$quotedPython = '"' + (Resolve-Path -LiteralPath $PythonPath).Path + '"'
$quotedModels = '"' + (Resolve-Path -LiteralPath $ModelsDir).Path + '"'
$arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File $quotedStart -PythonPath $quotedPython -ModelsDir $quotedModels"
if ($PronounClassifierDir -and (Test-Path -LiteralPath $PronounClassifierDir)) {
    $quotedPronoun = '"' + (Resolve-Path -LiteralPath $PronounClassifierDir).Path + '"'
    $arguments += " -PronounClassifierDir $quotedPronoun"
}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Output "Installed and started: $TaskName"
