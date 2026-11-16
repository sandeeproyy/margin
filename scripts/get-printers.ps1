param(
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Printing

function Get-FriendlyStatus {
    param($Printer)

    if ($null -eq $Printer) {
        return [ordered]@{ level = 'unknown'; label = 'Unknown'; detail = 'Printer status unavailable' }
    }

    if ($Printer.WorkOffline -eq $true) {
        return [ordered]@{ level = 'offline'; label = 'Offline'; detail = 'This printer is marked offline' }
    }

    $state = [int]$Printer.PrinterStatus
    switch ($state) {
        3 { return [ordered]@{ level = 'ready'; label = 'Ready'; detail = 'Connected and ready' } }
        4 { return [ordered]@{ level = 'busy'; label = 'Printing'; detail = 'A job is currently printing' } }
        5 { return [ordered]@{ level = 'busy'; label = 'Warming up'; detail = 'The printer is getting ready' } }
        7 { return [ordered]@{ level = 'offline'; label = 'Offline'; detail = 'Check the USB cable and printer power' } }
        6 { return [ordered]@{ level = 'error'; label = 'Stopped'; detail = 'The print queue is stopped' } }
        default {
            if ($Printer.PrinterState -eq 0) {
                return [ordered]@{ level = 'ready'; label = 'Ready'; detail = 'Connected and ready' }
            }
            return [ordered]@{ level = 'unknown'; label = 'Check printer'; detail = 'Windows reports a printer warning' }
        }
    }
}

function Get-ShortPaperName {
    param([string]$Name, [string]$Fallback)

    $value = $Name.Trim()

    $known = @(
        @{ Pattern = '^A4\b'; Label = 'A4' },
        @{ Pattern = '^A3\+'; Label = 'A3+' },
        @{ Pattern = '^A3\b'; Label = 'A3' },
        @{ Pattern = '^A5\b'; Label = 'A5' },
        @{ Pattern = '^A6\b'; Label = 'A6' },
        @{ Pattern = '^A2\b'; Label = 'A2' },
        @{ Pattern = '^Letter\b'; Label = 'Letter' },
        @{ Pattern = '^Legal\b'; Label = 'Legal' },
        @{ Pattern = '^Tabloid\b'; Label = 'Tabloid' },
        @{ Pattern = '^Executive\b'; Label = 'Executive' },
        @{ Pattern = '^Statement\b'; Label = 'Statement' },
        @{ Pattern = '^B4\b'; Label = 'B4' },
        @{ Pattern = '^B5\b'; Label = 'B5' },
        @{ Pattern = '^B6\b'; Label = 'B6' },
        @{ Pattern = '^Envelope #10'; Label = 'Envelope #10' },
        @{ Pattern = '^Envelope DL'; Label = 'Envelope DL' },
        @{ Pattern = '^Envelope C6'; Label = 'Envelope C6' },
        @{ Pattern = '^Envelope C5'; Label = 'Envelope C5' },
        @{ Pattern = '^16K\b'; Label = '16K' },
        @{ Pattern = '^8K\b'; Label = '8K' },
        @{ Pattern = '^10 x 15 cm'; Label = 'Photo 10 x 15' },
        @{ Pattern = '^13 x 18 cm'; Label = 'Photo 13 x 18' },
        @{ Pattern = '^20 x 25 cm'; Label = 'Photo 20 x 25' },
        @{ Pattern = '^9 x 13 cm'; Label = 'Photo 9 x 13' },
        @{ Pattern = '^5 x 8 in'; Label = 'Photo 5 x 8' },
        @{ Pattern = '^16:9 wide'; Label = 'Wide 16:9' }
    )

    foreach ($item in $known) {
        if ($value -match $item.Pattern) { return $item.Label }
    }

    $clean = $value -replace '\s*\([^)]*\)\s*', '' -replace '\s+\d+(\.\d+)?\s*x\s*\d+(\.\d+)?\s*(mm|in|cm)\s*$', ''
    if ([string]::IsNullOrWhiteSpace($clean)) { $clean = $Fallback }
    return $clean.Trim()
}

function Get-PaperDetail {
    param($Paper, [string]$ShortName)

    $dimensions = '{0:0.#} x {1:0.#} mm' -f ($Paper.Width * 0.254), ($Paper.Height * 0.254)
    if ($ShortName -eq 'Letter') { return '8.5 x 11 in | 216 x 279 mm' }
    if ($ShortName -eq 'Legal') { return '8.5 x 14 in | 216 x 356 mm' }
    if ($ShortName -eq 'Tabloid') { return '11 x 17 in | 279 x 432 mm' }
    if ($ShortName -eq 'Executive') { return '7.25 x 10.5 in' }
    return $dimensions
}

$defaultName = $null
$wmiPrinters = @()
try {
    $wmiPrinters = @(Get-CimInstance -ClassName Win32_Printer -ErrorAction Stop)
} catch {
    try {
        $wmiPrinters = @(Get-WmiObject -Class Win32_Printer -ErrorAction SilentlyContinue)
    } catch {
        $wmiPrinters = @()
    }
}
$defaultWmi = $wmiPrinters | Where-Object { $_.Default -eq $true } | Select-Object -First 1
if ($defaultWmi) { $defaultName = $defaultWmi.Name }

$printServer = $null
try {
    $printServer = New-Object System.Printing.LocalPrintServer
} catch {
    $printServer = $null
}

$result = @()
$installedNames = @([System.Drawing.Printing.PrinterSettings]::InstalledPrinters)

foreach ($name in $installedNames) {
    $wmi = $wmiPrinters | Where-Object { $_.Name -eq $name } | Select-Object -First 1
    $port = if ($wmi) { [string]$wmi.PortName } else { '' }
    $driver = if ($wmi) { [string]$wmi.DriverName } else { '' }

    $looksVirtual = $false
    if ($name -match 'Microsoft Print to PDF|OneNote|XPS Document Writer|Fax|Send To') { $looksVirtual = $true }
    if ($port -in @('PORTPROMPT:', 'nul:', 'FILE:')) { $looksVirtual = $true }
    if ($looksVirtual) { continue }

    try {
        $settings = New-Object System.Drawing.Printing.PrinterSettings
        $settings.PrinterName = $name
        if (-not $settings.IsValid) { continue }

        $capabilities = $null
        $queue = $null
        if ($printServer) {
            try {
                $queue = $printServer.GetPrintQueue($name)
                $capabilities = $queue.GetPrintCapabilities()
            } catch {
                $capabilities = $null
            }
        }

        $colors = @()
        if ($capabilities -and $capabilities.OutputColorCapability) {
            $colors = @($capabilities.OutputColorCapability | ForEach-Object { $_.ToString() })
        } elseif ($settings.SupportsColor) {
            $colors = @('Color')
        }
        $supportsColor = ($colors -contains 'Color')

        $duplexModes = @('OneSided')
        if ($capabilities -and $capabilities.DuplexingCapability) {
            $duplexModes = @($capabilities.DuplexingCapability | ForEach-Object { $_.ToString() })
        }
        $supportsDuplex = ($duplexModes -contains 'TwoSidedShortEdge' -or $duplexModes -contains 'TwoSidedLongEdge')

        $maxCopies = 99
        if ($capabilities -and $capabilities.MaxCopyCount -gt 0) {
            $maxCopies = [int]$capabilities.MaxCopyCount
        } elseif ($settings.MaximumCopies -gt 0) {
            $maxCopies = [int]$settings.MaximumCopies
        }

        $qualityLabels = @{
            'High' = 'Fine'
            'Medium' = 'Standard'
            'Low' = 'Light'
            'Draft' = 'Draft'
        }
        $qualities = @()
        $seenQuality = @{}
        foreach ($resolution in @($settings.PrinterResolutions)) {
            $kind = $resolution.Kind.ToString()
            if ($seenQuality.ContainsKey($kind)) { continue }
            if ($kind -notin @('High', 'Medium', 'Low', 'Draft')) { continue }
            $seenQuality[$kind] = $true
            $qualities += [ordered]@{
                id = $kind
                label = $qualityLabels[$kind]
            }
        }
        if ($qualities.Count -eq 0) {
            $qualities = @([ordered]@{ id = 'PrinterDefault'; label = 'Printer default' })
        }
        $defaultQuality = if ($seenQuality.ContainsKey('Medium')) { 'Medium' } elseif ($seenQuality.ContainsKey('High')) { 'High' } else { $qualities[0].id }

        $paperSizes = @()
        $seenPaper = @{}
        foreach ($paper in @($settings.PaperSizes)) {
            $raw = [int]$paper.RawKind
            if ($paper.PaperName -match 'User-Defined') { continue }
            if ($paper.Width -le 0 -or $paper.Height -le 0) { continue }
            $shortName = Get-ShortPaperName -Name $paper.PaperName -Fallback $paper.PaperName
            $paperId = '{0}-{1}-{2}' -f $raw, $paper.Width, $paper.Height
            if ($seenPaper.ContainsKey($paperId)) { continue }
            $seenPaper[$paperId] = $true
            $paperSizes += [ordered]@{
                id = $paperId
                name = $shortName
                fullName = $paper.PaperName
                detail = Get-PaperDetail -Paper $paper -ShortName $shortName
                rawKind = $raw
                width = [int]$paper.Width
                height = [int]$paper.Height
            }
        }

        $defaultPaper = $settings.DefaultPageSettings.PaperSize
        $defaultPaperId = $null
        if ($defaultPaper) {
            $candidate = '{0}-{1}-{2}' -f [int]$defaultPaper.RawKind, $defaultPaper.Width, $defaultPaper.Height
            $match = $paperSizes | Where-Object { $_.id -eq $candidate } | Select-Object -First 1
            if ($match) { $defaultPaperId = $match.id }
            if (-not $defaultPaperId) {
                $match = $paperSizes | Where-Object { $_.rawKind -eq [int]$defaultPaper.RawKind } | Select-Object -First 1
                if ($match) { $defaultPaperId = $match.id }
            }
        }
        if (-not $defaultPaperId -and $paperSizes.Count -gt 0) { $defaultPaperId = $paperSizes[0].id }

        $sources = @()
        $seenSource = @{}
        foreach ($source in @($settings.PaperSources)) {
            $sourceId = '{0}' -f $source.RawKind
            if ($seenSource.ContainsKey($sourceId)) { continue }
            $seenSource[$sourceId] = $true
            $sources += [ordered]@{
                id = $sourceId
                name = $source.SourceName
                rawKind = [int]$source.RawKind
            }
        }

        $status = Get-FriendlyStatus -Printer $wmi

        $result += [ordered]@{
            name = $name
            port = $port
            driver = $driver
            isDefault = ($name -eq $defaultName)
            status = $status
            supportsColor = $supportsColor
            colors = $colors
            supportsDuplex = $supportsDuplex
            duplexModes = $duplexModes
            maxCopies = [Math]::Min($maxCopies, 999)
            qualities = $qualities
            defaultQuality = $defaultQuality
            papers = $paperSizes
            defaultPaperId = $defaultPaperId
            sources = $sources
        }
    } catch {
        # A driver can fail to report capabilities without failing printing.
        $result += [ordered]@{
            name = $name
            port = $port
            driver = $driver
            isDefault = ($name -eq $defaultName)
            status = [ordered]@{ level = 'unknown'; label = 'Check printer'; detail = 'Capabilities unavailable' }
            supportsColor = $false
            colors = @('Monochrome')
            supportsDuplex = $false
            duplexModes = @('OneSided')
            maxCopies = 99
            qualities = @([ordered]@{ id = 'PrinterDefault'; label = 'Printer default' })
            defaultQuality = 'PrinterDefault'
            papers = @()
            defaultPaperId = $null
            sources = @()
        }
    } finally {
        if ($settings) { $settings = $null }
        if ($capabilities) { $capabilities = $null }
        if ($queue) { $queue = $null }
    }
}

if ($printServer) { $printServer.Dispose() }

$result = @($result | Sort-Object @{ Expression = { if ($_.isDefault) { 0 } else { 1 } } }, @{ Expression = { $_.name } })

$json = [ordered]@{
    ok = $true
    generatedAt = (Get-Date).ToUniversalTime().ToString('o')
    defaultPrinter = $defaultName
    printers = $result
} | ConvertTo-Json -Depth 10 -Compress

if ($OutputPath) {
    [System.IO.File]::WriteAllText($OutputPath, $json, [System.Text.UTF8Encoding]::new($false))
} else {
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    Write-Output $json
}
