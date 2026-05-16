$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$url = "http://127.0.0.1:8000/"
$serverScript = Join-Path $root "server.js"
$codexNode = Join-Path $env:LOCALAPPDATA "OpenAI\Codex\bin\node.exe"

function Test-GeoDespachoServer {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

if (-not (Test-Path $serverScript)) {
  Write-Host "No se encontro server.js en la carpeta del proyecto."
  exit 1
}

if (-not (Test-GeoDespachoServer)) {
  if (Test-Path $codexNode) {
    $nodeExe = $codexNode
  } else {
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeCommand) {
      $nodeExe = $nodeCommand.Source
    } else {
      Write-Host "No se encontro Node.js para iniciar el servidor local."
      Write-Host "Puedes publicar esta carpeta en GitHub Pages o instalar Node.js."
      exit 1
    }
  }

  Start-Process -WindowStyle Minimized -FilePath $nodeExe -ArgumentList "`"$serverScript`"" -WorkingDirectory $root
  Start-Sleep -Seconds 2
}

if (Test-GeoDespachoServer) {
  Start-Process $url
  Write-Host "GeoDespacho abierto en $url"
} else {
  Write-Host "No fue posible iniciar el servidor local."
  exit 1
}
