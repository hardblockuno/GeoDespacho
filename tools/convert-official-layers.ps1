param(
  [string]$SourceDir = "capas_oficiales_2025\originales",
  [string]$OutputDir = "capas_oficiales_2025\geojson"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem

function ConvertTo-Slug {
  param([string]$Value)

  $normalized = $Value.Normalize([Text.NormalizationForm]::FormD)
  $builder = New-Object Text.StringBuilder
  foreach ($char in $normalized.ToCharArray()) {
    $category = [Globalization.CharUnicodeInfo]::GetUnicodeCategory($char)
    if ($category -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$builder.Append($char)
    }
  }

  return ($builder.ToString().ToLowerInvariant() -replace '[^a-z0-9]+', '_' -replace '^_|_$', '')
}

function ConvertTo-KeySlug {
  param([string]$Value)

  return (ConvertTo-Slug $Value).Replace("_", "")
}

function Get-KmlText {
  param([System.IO.FileInfo]$File)

  if ($File.Extension.ToLowerInvariant() -eq ".kmz") {
    $zip = [System.IO.Compression.ZipFile]::OpenRead($File.FullName)
    try {
      $entry = $zip.Entries | Where-Object { $_.FullName.ToLowerInvariant().EndsWith(".kml") } | Select-Object -First 1
      if (-not $entry) {
        throw "El KMZ no contiene KML: $($File.Name)"
      }
      $stream = $entry.Open()
      try {
        $reader = New-Object System.IO.StreamReader($stream, [Text.Encoding]::UTF8, $true)
        try {
          return $reader.ReadToEnd()
        } finally {
          $reader.Dispose()
        }
      } finally {
        $stream.Dispose()
      }
    } finally {
      $zip.Dispose()
    }
  }

  return [IO.File]::ReadAllText($File.FullName, [Text.Encoding]::UTF8)
}

function Repair-KmlText {
  param([string]$Text)

  if ($Text -match "xsi:" -and $Text -notmatch "xmlns:xsi=") {
    return ($Text -replace "<kml\s+", '<kml xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ')
  }

  return $Text
}

function Decode-XmlText {
  param($Node)

  if ($null -eq $Node) {
    return ""
  }

  return ([string]$Node.InnerText).Trim()
}

function Get-Properties {
  param($Placemark)

  $properties = [ordered]@{}
  $name = Decode-XmlText ($Placemark.GetElementsByTagName("name") | Select-Object -First 1)
  if ($name) {
    $properties["nombre"] = $name
  }

  foreach ($data in $Placemark.GetElementsByTagName("SimpleData")) {
    $key = $data.GetAttribute("name")
    if ($key) {
      $properties[$key] = Decode-XmlText $data
    }
  }

  foreach ($data in $Placemark.GetElementsByTagName("Data")) {
    $key = $data.GetAttribute("name")
    $value = Decode-XmlText ($data.GetElementsByTagName("value") | Select-Object -First 1)
    if ($key -and $value) {
      $properties[$key] = $value
    }
  }

  return $properties
}

function Get-PropertyValue {
  param(
    $Properties,
    [string[]]$Names
  )

  $wanted = @($Names | ForEach-Object { ConvertTo-KeySlug $_ })
  foreach ($name in $Names) {
    if ($Properties.Contains($name) -and $Properties[$name]) {
      return $Properties[$name]
    }
  }

  foreach ($key in $Properties.Keys) {
    if ($wanted -contains (ConvertTo-KeySlug $key)) {
      return $Properties[$key]
    }
  }
  return $null
}

function Set-PropertyCaseSafe {
  param(
    $Properties,
    [string]$Name,
    $Value
  )

  $existingKeys = @($Properties.Keys | Where-Object { $_.ToString().ToLowerInvariant() -eq $Name.ToLowerInvariant() -and $_ -ne $Name })
  foreach ($key in $existingKeys) {
    $Properties.Remove($key)
  }
  $Properties[$Name] = $Value
}

function Add-NormalizedFields {
  param(
    [hashtable]$Properties,
    [string]$LayerKind
  )

  if ($LayerKind -eq "brigades") {
    $estado = Get-PropertyValue $Properties @("Estado", "ESTADO", "estado")
    $dotacion = Get-PropertyValue $Properties @("Dotación", "Dotacion", "DOTACION", "DotaciÃ³n")
    $ubicacion = Get-PropertyValue $Properties @("Ubicación", "Ubicacion", "UbicaciÃ³n", "COMUNA", "Comuna")
    $tipo = Get-PropertyValue $Properties @("Tipo Unidad", "Clase", "TIPO", "tipo")

    Set-PropertyCaseSafe $Properties "nombre" (Get-PropertyValue $Properties @("Nombre Unidad", "NOMBRE", "nombre"))
    Set-PropertyCaseSafe $Properties "base" $ubicacion
    Set-PropertyCaseSafe $Properties "tipo" $tipo
    $normalizedEstado = if ($estado) { $estado } else { "Operativa" }
    $normalizedDisponible = if (($estado -as [string]).ToLowerInvariant() -match "no|mantencion|mantenimiento|inactiva") { $false } else { $true }
    $normalizedPersonal = if ($dotacion) { [int]$dotacion } else { 0 }

    Set-PropertyCaseSafe $Properties "estado" $normalizedEstado
    Set-PropertyCaseSafe $Properties "disponible" $normalizedDisponible
    Set-PropertyCaseSafe $Properties "personal" $normalizedPersonal
    Set-PropertyCaseSafe $Properties "velocidad_kmh" 50
    Set-PropertyCaseSafe $Properties "alistamiento_min" 10
  }

  if ($LayerKind -eq "towers") {
    Set-PropertyCaseSafe $Properties "nombre" (Get-PropertyValue $Properties @("NOMBRE", "Nombre", "nombre"))
    Set-PropertyCaseSafe $Properties "codigo" $Properties["nombre"]
    $sourceRadius = Get-PropertyValue $Properties @("radio_km", "radio", "RADIO", "Radio")
    if ($sourceRadius) {
      Set-PropertyCaseSafe $Properties "radio_km" $sourceRadius
    }
    Set-PropertyCaseSafe $Properties "estado" "Operativa"
  }

  if ($LayerKind -eq "technical") {
    if (-not $Properties["tipo"]) {
      Set-PropertyCaseSafe $Properties "tipo" "Personal tecnico"
    }
    if (-not $Properties["estado"]) {
      Set-PropertyCaseSafe $Properties "estado" "Vigente"
    }
  }

  Set-PropertyCaseSafe $Properties "layer_kind" $LayerKind
  return Remove-ConflictingNormalizedKeys $Properties
}

function Remove-ConflictingNormalizedKeys {
  param($Properties)

  $reserved = @(
    "nombre",
    "base",
    "tipo",
    "estado",
    "disponible",
    "personal",
    "velocidadkmh",
    "alistamientomin",
    "codigo",
    "radiokm",
    "layerkind"
  )
  $canonical = @{
    nombre = "nombre"
    base = "base"
    tipo = "tipo"
    estado = "estado"
    disponible = "disponible"
    personal = "personal"
    velocidadkmh = "velocidad_kmh"
    alistamientomin = "alistamiento_min"
    codigo = "codigo"
    radiokm = "radio_km"
    layerkind = "layer_kind"
  }
  $clean = [ordered]@{}

  foreach ($key in $Properties.Keys) {
    $slug = ConvertTo-KeySlug $key
    $canonicalName = if ($canonical.ContainsKey($slug)) { $canonical[$slug] } else { $key }
    if (($reserved -contains $slug) -and ($key -ne $canonicalName)) {
      continue
    }

    $existing = @($clean.Keys | Where-Object { (ConvertTo-KeySlug $_) -eq $slug })
    foreach ($existingKey in $existing) {
      $clean.Remove($existingKey)
    }
    $clean[$key] = $Properties[$key]
  }

  return $clean
}

function Convert-CoordinateText {
  param([string]$Text)

  $coordinates = @()
  foreach ($pair in (($Text.Trim() -split '\s+') | Where-Object { $_ })) {
    $parts = $pair -split ','
    if ($parts.Count -ge 2) {
      $lng = 0.0
      $lat = 0.0
      if ([double]::TryParse($parts[0], [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$lng) -and
          [double]::TryParse($parts[1], [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$lat)) {
        $coordinates += ,@($lng, $lat)
      }
    }
  }

  return ,$coordinates
}

function Close-Ring {
  param([array]$Coordinates)

  if ($Coordinates.Count -eq 0) {
    return $Coordinates
  }

  $first = $Coordinates[0]
  $last = $Coordinates[$Coordinates.Count - 1]
  if ($first[0] -ne $last[0] -or $first[1] -ne $last[1]) {
    return ,@($Coordinates + ,$first)
  }
  return ,$Coordinates
}

function Get-Geometry {
  param($Placemark)

  $geometries = @()

  foreach ($point in $Placemark.GetElementsByTagName("Point")) {
    $coordNode = $point.GetElementsByTagName("coordinates") | Select-Object -First 1
    $coords = Convert-CoordinateText (Decode-XmlText $coordNode)
    if ($coords.Count -ge 1) {
      $geometries += ,[ordered]@{
        type = "Point"
        coordinates = @($coords[0][0], $coords[0][1])
      }
    }
  }

  foreach ($line in $Placemark.GetElementsByTagName("LineString")) {
    $coordNode = $line.GetElementsByTagName("coordinates") | Select-Object -First 1
    $coords = Convert-CoordinateText (Decode-XmlText $coordNode)
    if ($coords.Count -ge 2) {
      $geometries += ,[ordered]@{
        type = "LineString"
        coordinates = $coords
      }
    }
  }

  foreach ($polygon in $Placemark.GetElementsByTagName("Polygon")) {
    $rings = @()
    $outerBoundary = $polygon.GetElementsByTagName("outerBoundaryIs") | Select-Object -First 1
    if ($outerBoundary) {
      $coordNode = $outerBoundary.GetElementsByTagName("coordinates") | Select-Object -First 1
      $outer = Convert-CoordinateText (Decode-XmlText $coordNode)
      if ($outer.Count -ge 4) {
        $rings += ,(Close-Ring $outer)
      }
    }

    foreach ($innerBoundary in $polygon.GetElementsByTagName("innerBoundaryIs")) {
      $coordNode = $innerBoundary.GetElementsByTagName("coordinates") | Select-Object -First 1
      $inner = Convert-CoordinateText (Decode-XmlText $coordNode)
      if ($inner.Count -ge 4) {
        $rings += ,(Close-Ring $inner)
      }
    }

    if ($rings.Count -gt 0) {
      $geometries += ,[ordered]@{
        type = "Polygon"
        coordinates = $rings
      }
    }
  }

  if ($geometries.Count -eq 1) {
    return $geometries[0]
  }

  if ($geometries.Count -gt 1) {
    return [ordered]@{
      type = "GeometryCollection"
      geometries = $geometries
    }
  }

  return $null
}

function Get-LayerKind {
  param([string]$FileName)

  $slug = ConvertTo-Slug $FileName
  if ($slug -match "brigadas") {
    return "brigades"
  }
  if ($slug -match "deteccion|torre|camara") {
    return "towers"
  }
  if ($slug -match "personal_tecnico") {
    return "technical"
  }
  return "general"
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$manifest = @()

Get-ChildItem -Path $SourceDir -File |
  Where-Object { $_.Extension.ToLowerInvariant() -in @(".kml", ".kmz") } |
  ForEach-Object {
    $layerKind = Get-LayerKind $_.Name
    $kmlText = Repair-KmlText (Get-KmlText $_)
    try {
      [xml]$xml = $kmlText
    } catch {
      Write-Warning "No se pudo leer XML/KML en $($_.Name): $($_.Exception.Message.Split([Environment]::NewLine)[0])"
      return
    }
    $features = @()

    foreach ($placemark in $xml.GetElementsByTagName("Placemark")) {
      $geometry = Get-Geometry $placemark
      if ($null -eq $geometry) {
        continue
      }

      $properties = Get-Properties $placemark
      $properties = Add-NormalizedFields $properties $layerKind
      $features += ,[ordered]@{
        type = "Feature"
        properties = $properties
        geometry = $geometry
      }
    }

    $geojson = [ordered]@{
      type = "FeatureCollection"
      name = (ConvertTo-Slug $_.BaseName)
      source_file = $_.Name
      layer_kind = $layerKind
      converted_at = (Get-Date).ToString("s")
      features = $features
    }

    $outputName = "$(ConvertTo-Slug $_.BaseName).geojson"
    $outputPath = Join-Path $OutputDir $outputName
    $jsonText = $geojson | ConvertTo-Json -Depth 100 -Compress
    [IO.File]::WriteAllText($outputPath, $jsonText, [Text.UTF8Encoding]::new($false))

    $manifest += [ordered]@{
      source = $_.Name
      output = $outputName
      layer_kind = $layerKind
      features = $features.Count
    }

    Write-Output "$($_.Name) -> $outputName ($($features.Count) features, $layerKind)"
  }

$manifestText = if ($manifest.Count -gt 0) { $manifest | ConvertTo-Json -Depth 10 -Compress } else { "[]" }
[IO.File]::WriteAllText((Join-Path $OutputDir "manifest.json"), $manifestText, [Text.UTF8Encoding]::new($false))
