param(
  [ValidateSet('fressi','guenni')]
  [string]$Instance = 'guenni',
  [string]$Session = 'default',
  [string]$UserRef = 'e10',
  [string]$PasswordRef = 'e12',
  [string]$SubmitRef = 'e13'
)

$masterPath = Join-Path $PSScriptRoot '..\master\env\.env.master'
$suffix = $Instance.ToUpperInvariant()
function Read-AgentOneValue([string]$Name) {
  $line = Get-Content -LiteralPath $masterPath | Where-Object { $_ -like "$Name=*" } | Select-Object -Last 1
  if (-not $line) { throw "Konfiguration fehlt: $Name" }
  return $line.Substring($Name.Length + 1)
}

$user = Read-AgentOneValue "AGENTONE_${suffix}_USER"
$password = Read-AgentOneValue "AGENTONE_${suffix}_PASSWORD"
if (-not $user -or -not $password) { throw 'Private Zugangsdaten sind leer.' }

& npx.cmd --yes --package '@playwright/cli' playwright-cli "-s=$Session" fill $UserRef $user | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Benutzername konnte nicht gesetzt werden.' }
& npx.cmd --yes --package '@playwright/cli' playwright-cli "-s=$Session" fill $PasswordRef $password | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Passwort konnte nicht gesetzt werden.' }
& npx.cmd --yes --package '@playwright/cli' playwright-cli "-s=$Session" click $SubmitRef | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Anmeldung konnte nicht abgesendet werden.' }
Write-Output "$Instance wurde in der isolierten Browser-Session angemeldet."
