param(
    [Parameter(Mandatory = $true)]
    [string]$InputPath,
    [Parameter(Mandatory = $true)]
    [string]$OutputPath,
    [Parameter(Mandatory = $true)]
    [string]$ResultPath
)

$ErrorActionPreference = 'Stop'

function Write-Result {
    param([hashtable]$Result)
    $json = $Result | ConvertTo-Json -Depth 5 -Compress
    [System.IO.File]::WriteAllText($ResultPath, $json, [System.Text.UTF8Encoding]::new($false))
}

function Release-ComObject {
    param($Object)
    if ($null -ne $Object) {
        try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($Object) } catch { }
    }
}

$extension = [System.IO.Path]::GetExtension($InputPath).ToLowerInvariant()
$word = $null
$wordDocument = $null
$excel = $null
$workbook = $null
$powerPoint = $null
$presentation = $null

try {
    if (-not (Test-Path -LiteralPath $InputPath)) {
        throw "The uploaded file could not be found."
    }

    $outputDirectory = [System.IO.Path]::GetDirectoryName($OutputPath)
    if ($outputDirectory -and -not (Test-Path -LiteralPath $outputDirectory)) {
        New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
    }

    switch ($extension) {
        { $_ -in @('.doc', '.docx', '.rtf', '.odt', '.txt', '.md') } {
            $word = New-Object -ComObject Word.Application
            $word.Visible = $false
            $word.DisplayAlerts = 0
            $word.AutomationSecurity = 3
            $wordDocument = $word.Documents.Open(
                $InputPath,
                $false,
                $true,
                $false
            )
            $wordDocument.ExportAsFixedFormat($OutputPath, 17)
        }
        { $_ -in @('.xls', '.xlsx', '.xlsm', '.csv') } {
            $excel = New-Object -ComObject Excel.Application
            $excel.Visible = $false
            $excel.DisplayAlerts = $false
            $excel.AutomationSecurity = 3
            $workbook = $excel.Workbooks.Open($InputPath, 0, $true)
            $workbook.ExportAsFixedFormat(0, $OutputPath)
        }
        { $_ -in @('.ppt', '.pptx', '.pps', '.ppsx') } {
            $powerPoint = New-Object -ComObject PowerPoint.Application
            $powerPoint.DisplayAlerts = 1
            $presentation = $powerPoint.Presentations.Open($InputPath, $true, $false, $false)
            $presentation.SaveAs($OutputPath, 32)
        }
        default {
            throw "This file type cannot be printed yet."
        }
    }

    if (-not (Test-Path -LiteralPath $OutputPath)) {
        throw "The document could not be converted to a print-ready PDF."
    }

    $file = Get-Item -LiteralPath $OutputPath
    if ($file.Length -lt 100) {
        throw "The document conversion produced an empty file."
    }

    Write-Result @{
        ok = $true
        bytes = $file.Length
        converter = 'office'
    }
    exit 0
} catch {
    $message = $_.Exception.Message
    if ($_.Exception.InnerException) {
        $message = $_.Exception.InnerException.Message
    }

    Write-Result @{
        ok = $false
        error = $message
        detail = $_.Exception.ToString()
    }
    exit 1
} finally {
    if ($wordDocument) {
        try { $wordDocument.Close($false) } catch { }
    }
    if ($word) {
        try { $word.Quit() } catch { }
    }
    if ($workbook) {
        try { $workbook.Close($false) } catch { }
    }
    if ($excel) {
        try { $excel.Quit() } catch { }
    }
    if ($presentation) {
        try { $presentation.Close() } catch { }
    }
    if ($powerPoint) {
        try { $powerPoint.Quit() } catch { }
    }

    Release-ComObject $wordDocument
    Release-ComObject $word
    Release-ComObject $workbook
    Release-ComObject $excel
    Release-ComObject $presentation
    Release-ComObject $powerPoint

    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
