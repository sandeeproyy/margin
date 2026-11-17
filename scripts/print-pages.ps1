param(
    [Parameter(Mandatory = $true)]
    [string]$ManifestPath,
    [Parameter(Mandatory = $true)]
    [string]$ResultPath,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$csharp = @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Printing;
using System.IO;
using System.Runtime.InteropServices;

public class MarginNativePrinter
{
    private const int DM_OUT_BUFFER = 0x00000002;
    private const int DM_IN_BUFFER = 0x00000008;
    private const int DM_ORIENTATION = 0x00000001;
    private const int DM_PAPERSIZE = 0x00000002;
    private const int DM_PAPERLENGTH = 0x00000004;
    private const int DM_PAPERWIDTH = 0x00000008;
    private const int DM_COPIES = 0x00000100;
    private const int DM_DEFAULTSOURCE = 0x00000200;
    private const int DM_PRINTQUALITY = 0x00000400;
    private const int DM_COLOR = 0x00000800;
    private const int DM_DUPLEX = 0x00001000;
    private const int DM_COLLATE = 0x00008000;

    private const short DMRES_HIGH = -4;
    private const short DMRES_MEDIUM = -3;
    private const short DMRES_LOW = -2;
    private const short DMRES_DRAFT = -1;

    private const int DMCOLOR_COLOR = 1;
    private const int DMCOLOR_MONOCHROME = 2;

    private const short DMORIENT_PORTRAIT = 1;
    private const short DMORIENT_LANDSCAPE = 2;

    private const short DMDUP_SIMPLEX = 1;
    private const short DMDUP_VERTICAL = 2;
    private const short DMDUP_HORIZONTAL = 3;

    private const short DMPAPER_USER = 256;

    private const int HORZRES = 8;
    private const int VERTRES = 10;
    private const int LOGPIXELSX = 88;
    private const int LOGPIXELSY = 90;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct DOCINFO
    {
        public int cbSize;
        [MarshalAs(UnmanagedType.LPWStr)]
        public string lpszDocName;
        public IntPtr lpszOutput;
        public IntPtr lpszDatatype;
        public int fwType;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true)]
    private static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "DocumentPropertiesW", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern int DocumentProperties(
        IntPtr hwnd,
        IntPtr hPrinter,
        string pDeviceName,
        IntPtr pDevModeOutput,
        IntPtr pDevModeInput,
        int fMode);

    [DllImport("gdi32.dll", EntryPoint = "CreateDCW", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern IntPtr CreateDC(string pwszDriver, string pwszDevice, string pszPort, IntPtr pdm);

    [DllImport("gdi32.dll", SetLastError = true)]
    private static extern bool DeleteDC(IntPtr hdc);

    [DllImport("gdi32.dll", EntryPoint = "StartDocW", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern int StartDoc(IntPtr hdc, ref DOCINFO lpdi);

    [DllImport("gdi32.dll", SetLastError = true)]
    private static extern int StartPage(IntPtr hdc);

    [DllImport("gdi32.dll", SetLastError = true)]
    private static extern int EndPage(IntPtr hdc);

    [DllImport("gdi32.dll", SetLastError = true)]
    private static extern int EndDoc(IntPtr hdc);

    [DllImport("gdi32.dll", SetLastError = true)]
    private static extern int AbortDoc(IntPtr hdc);

    [DllImport("gdi32.dll", SetLastError = true)]
    private static extern int GetDeviceCaps(IntPtr hdc, int nIndex);

    public static int Print(
        string printerName,
        string[] pagePaths,
        int copies,
        bool collate,
        bool color,
        string quality,
        bool landscape,
        string duplex,
        int paperRawKind,
        int paperWidth,
        int paperHeight,
        int paperSourceRawKind,
        string scale,
        double renderDpi,
        string documentName,
        string outputPath)
    {
        if (pagePaths == null || pagePaths.Length == 0)
        {
            throw new ArgumentException("No printable pages were supplied.");
        }

        IntPtr hPrinter = IntPtr.Zero;
        IntPtr devMode = IntPtr.Zero;
        IntPtr hdc = IntPtr.Zero;
        IntPtr outputPtr = IntPtr.Zero;
        bool documentStarted = false;
        int jobId = 0;

        try
        {
            if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not open printer: " + printerName);
            }

            int devModeSize = DocumentProperties(IntPtr.Zero, hPrinter, printerName, IntPtr.Zero, IntPtr.Zero, 0);
            if (devModeSize < 0)
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not read the printer settings.");
            }

            devMode = Marshal.AllocHGlobal(devModeSize);
            ZeroMemory(devMode, devModeSize);

            int readResult = DocumentProperties(IntPtr.Zero, hPrinter, printerName, devMode, IntPtr.Zero, DM_OUT_BUFFER);
            if (readResult < 0)
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not load the printer defaults.");
            }

            int fields = Marshal.ReadInt32(devMode, 72);
            int desiredFields = fields
                | DM_ORIENTATION
                | DM_COPIES
                | DM_COLOR
                | DM_DUPLEX
                | DM_COLLATE
                | DM_PAPERSIZE;

            short orientation = landscape ? DMORIENT_LANDSCAPE : DMORIENT_PORTRAIT;
            Marshal.WriteInt16(devMode, 76, orientation);

            if (paperRawKind > 0 && paperRawKind != DMPAPER_USER && paperWidth > 0 && paperHeight > 0)
            {
                Marshal.WriteInt16(devMode, 78, unchecked((short)paperRawKind));
            }
            else
            {
                Marshal.WriteInt16(devMode, 78, DMPAPER_USER);
                Marshal.WriteInt16(devMode, 80, unchecked((short)Math.Min(paperHeight, short.MaxValue)));
                Marshal.WriteInt16(devMode, 82, unchecked((short)Math.Min(paperWidth, short.MaxValue)));
                desiredFields |= DM_PAPERLENGTH | DM_PAPERWIDTH;
            }

            Marshal.WriteInt16(devMode, 86, 1);
            Marshal.WriteInt16(devMode, 100, (short)(collate ? 1 : 0));

            if (quality == "High")
            {
                Marshal.WriteInt16(devMode, 90, DMRES_HIGH);
                desiredFields |= DM_PRINTQUALITY;
            }
            else if (quality == "Medium")
            {
                Marshal.WriteInt16(devMode, 90, DMRES_MEDIUM);
                desiredFields |= DM_PRINTQUALITY;
            }
            else if (quality == "Low")
            {
                Marshal.WriteInt16(devMode, 90, DMRES_LOW);
                desiredFields |= DM_PRINTQUALITY;
            }
            else if (quality == "Draft")
            {
                Marshal.WriteInt16(devMode, 90, DMRES_DRAFT);
                desiredFields |= DM_PRINTQUALITY;
            }

            Marshal.WriteInt16(devMode, 92, (short)(color ? DMCOLOR_COLOR : DMCOLOR_MONOCHROME));

            short duplexMode = DMDUP_SIMPLEX;
            if (duplex == "long") { duplexMode = DMDUP_VERTICAL; }
            else if (duplex == "short") { duplexMode = DMDUP_HORIZONTAL; }
            Marshal.WriteInt16(devMode, 94, duplexMode);

            if (paperSourceRawKind > 0)
            {
                Marshal.WriteInt16(devMode, 88, unchecked((short)paperSourceRawKind));
                desiredFields |= DM_DEFAULTSOURCE;
            }

            Marshal.WriteInt32(devMode, 72, desiredFields);

            int applyResult = DocumentProperties(
                IntPtr.Zero, hPrinter, printerName, devMode, devMode,
                DM_IN_BUFFER | DM_OUT_BUFFER);
            if (applyResult < 0)
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "The printer rejected these settings.");
            }

            hdc = CreateDC("WINSPOOL", printerName, null, devMode);
            if (hdc == IntPtr.Zero)
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not create a printer context.");
            }

            int printableWidth = GetDeviceCaps(hdc, HORZRES);
            int printableHeight = GetDeviceCaps(hdc, VERTRES);
            int dpiX = GetDeviceCaps(hdc, LOGPIXELSX);
            int dpiY = GetDeviceCaps(hdc, LOGPIXELSY);

            if (printableWidth <= 0 || printableHeight <= 0 || dpiX <= 0 || dpiY <= 0)
            {
                throw new InvalidOperationException("The printer returned an invalid page size.");
            }

            DOCINFO docInfo = new DOCINFO();
            docInfo.cbSize = Marshal.SizeOf(typeof(DOCINFO));
            docInfo.lpszDocName = documentName;
            if (!string.IsNullOrEmpty(outputPath))
            {
                outputPtr = Marshal.StringToHGlobalUni(outputPath);
                docInfo.lpszOutput = outputPtr;
            }
            else
            {
                docInfo.lpszOutput = IntPtr.Zero;
            }
            docInfo.lpszDatatype = IntPtr.Zero;
            docInfo.fwType = 0;

            jobId = StartDoc(hdc, ref docInfo);
            if (jobId <= 0)
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Windows could not start the print job.");
            }
            documentStarted = true;

            List<int> order = BuildPageOrder(pagePaths.Length, Math.Max(1, copies), collate);
            double safeRenderDpi = renderDpi > 1.0 ? renderDpi : 200.0;

            for (int i = 0; i < order.Count; i++)
            {
                int pageIndex = order[i];

                if (StartPage(hdc) <= 0)
                {
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "Windows could not start a page.");
                }

                using (Bitmap bitmap = new Bitmap(pagePaths[pageIndex]))
                using (Graphics graphics = Graphics.FromHdc(hdc))
                {
                    // Printer graphics default to the Display unit (1/100 inch),
                    // while HORZRES/VERTRES and the raster are in device pixels.
                    // Pixel units keep the destination and the page caps aligned.
                    graphics.PageUnit = GraphicsUnit.Pixel;
                    graphics.CompositingQuality = CompositingQuality.HighQuality;
                    graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    graphics.SmoothingMode = SmoothingMode.HighQuality;
                    graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;

                    RectangleF destination;
                    if (scale == "actual")
                    {
                        float width = (float)(bitmap.Width / safeRenderDpi * dpiX);
                        float height = (float)(bitmap.Height / safeRenderDpi * dpiY);
                        destination = new RectangleF(
                            (printableWidth - width) / 2f,
                            (printableHeight - height) / 2f,
                            width,
                            height);
                    }
                    else if (scale == "fill")
                    {
                        destination = new RectangleF(0, 0, printableWidth, printableHeight);
                    }
                    else
                    {
                        float ratio = Math.Min(
                            (float)printableWidth / bitmap.Width,
                            (float)printableHeight / bitmap.Height);
                        float width = bitmap.Width * ratio;
                        float height = bitmap.Height * ratio;
                        destination = new RectangleF(
                            (printableWidth - width) / 2f,
                            (printableHeight - height) / 2f,
                            width,
                            height);
                    }

                    graphics.DrawImage(
                        bitmap,
                        destination,
                        new RectangleF(0, 0, bitmap.Width, bitmap.Height),
                        GraphicsUnit.Pixel);
                }

                if (EndPage(hdc) <= 0)
                {
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "Windows could not finish a page.");
                }
            }

            if (EndDoc(hdc) <= 0)
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Windows could not finish the print job.");
            }
            documentStarted = false;

            return jobId;
        }
        catch
        {
            if (documentStarted && hdc != IntPtr.Zero)
            {
                AbortDoc(hdc);
            }
            throw;
        }
        finally
        {
            if (hdc != IntPtr.Zero) { DeleteDC(hdc); }
            if (devMode != IntPtr.Zero) { Marshal.FreeHGlobal(devMode); }
            if (outputPtr != IntPtr.Zero) { Marshal.FreeHGlobal(outputPtr); }
            if (hPrinter != IntPtr.Zero) { ClosePrinter(hPrinter); }
        }
    }

    private static List<int> BuildPageOrder(int pageCount, int copies, bool collate)
    {
        List<int> order = new List<int>();
        if (copies <= 1)
        {
            for (int p = 0; p < pageCount; p++) { order.Add(p); }
            return order;
        }

        if (collate)
        {
            for (int c = 0; c < copies; c++)
            {
                for (int p = 0; p < pageCount; p++) { order.Add(p); }
            }
        }
        else
        {
            for (int p = 0; p < pageCount; p++)
            {
                for (int c = 0; c < copies; c++) { order.Add(p); }
            }
        }

        return order;
    }

    private static void ZeroMemory(IntPtr destination, int length)
    {
        byte[] zeros = new byte[length];
        Marshal.Copy(zeros, 0, destination, length);
    }
}
'@

function Write-Result {
    param([hashtable]$Result)
    $json = $Result | ConvertTo-Json -Depth 6 -Compress
    [System.IO.File]::WriteAllText($ResultPath, $json, [System.Text.UTF8Encoding]::new($false))
}

# ---------------------------------------------------------------------------
# XPS print path
#
# The Epson GDI driver ignores dmPrintQuality when a DEVMODE is passed to
# CreateDC, and dmColor does not survive reliably. Windows' XPS path converts a
# validated PrintTicket into the driver's private settings, which is the only
# reliable way to select Fine/HighQuality and full color per job.
# ---------------------------------------------------------------------------
$PrintSchemaNs = 'http://schemas.microsoft.com/windows/2003/08/printing/printschemaframework'

function Get-XmlNs {
    param([xml]$Xml)
    $ns = New-Object System.Xml.XmlNamespaceManager($Xml.NameTable)
    [void]$ns.AddNamespace('psf', 'http://schemas.microsoft.com/windows/2003/08/printing/printschemaframework')
    [void]$ns.AddNamespace('psk', 'http://schemas.microsoft.com/windows/2003/08/printing/printschemakeywords')
    Write-Output -NoEnumerate $ns
}

function Get-CapsOption {
    param([xml]$Caps, [string]$Feature, [string[]]$Names)
    $ns = Get-XmlNs $Caps
    foreach ($name in $Names) {
        $node = $Caps.SelectSingleNode("//psf:Feature[@name='$Feature']/psf:Option[@name='$name']", $ns)
        if ($node) { return $node }
    }
    return $null
}

function Get-QualityPlan {
    param([xml]$Caps, [string]$Quality)
    $preferred = switch ($Quality) {
        'High' { @('ns0000:HighQuality', 'psk:High', 'psk:Photographic') }
        'Medium' { @('ns0000:Standard', 'psk:Normal') }
        'Low' { @('ns0000:Draft', 'psk:Draft') }
        'Draft' { @('ns0000:Draft', 'psk:Draft') }
        default { @() }
    }
    if ($preferred.Count -eq 0) { return $null }
    $node = Get-CapsOption $Caps 'psk:PageOutputQuality' $preferred
    if (-not $node) { return $null }
    return @{ Name = $node.name }
}

function Get-ResolutionPlan {
    param([xml]$Caps, [string]$Quality)
    $ns = Get-XmlNs $Caps
    $options = @()
    foreach ($node in $Caps.SelectNodes("//psf:Feature[@name='psk:PageResolution']/psf:Option", $ns)) {
        $xNode = $node.SelectSingleNode("psf:ScoredProperty[@name='psk:ResolutionX']/psf:Value", $ns)
        $yNode = $node.SelectSingleNode("psf:ScoredProperty[@name='psk:ResolutionY']/psf:Value", $ns)
        if (-not $xNode -or -not $yNode) { continue }
        $x = 0; $y = 0
        [void][int]::TryParse($xNode.InnerText, [ref]$x)
        [void][int]::TryParse($yNode.InnerText, [ref]$y)
        if ($x -le 0) { continue }
        $options += [pscustomobject]@{ Name = $node.name; X = $x; Y = $y }
    }
    if ($options.Count -eq 0) { return $null }

    $target = switch ($Quality) {
        'High' { 720 }
        'Medium' { 360 }
        'Low' { 180 }
        'Draft' { 180 }
        default { 0 }
    }
    if ($target -le 0) { return $null }

    $exact = $options | Where-Object { $_.X -eq $target } | Select-Object -First 1
    if ($exact) { return $exact }
    if ($Quality -eq 'High') {
        return $options | Sort-Object X -Descending | Select-Object -First 1
    }
    if ($Quality -eq 'Low' -or $Quality -eq 'Draft') {
        return $options | Sort-Object X | Select-Object -First 1
    }
    return $options | Sort-Object { [Math]::Abs($_.X - $target) } | Select-Object -First 1
}

function Get-MediaPlan {
    param([xml]$Caps, [int]$Width, [int]$Height)
    if ($Width -le 0 -or $Height -le 0) { return $null }
    $ns = Get-XmlNs $Caps
    $targetShort = [Math]::Min($Width, $Height) * 254.0
    $targetLong = [Math]::Max($Width, $Height) * 254.0
    $bestNode = $null
    $bestDelta = [double]::MaxValue

    foreach ($node in $Caps.SelectNodes("//psf:Feature[@name='psk:PageMediaSize']/psf:Option", $ns)) {
        if ($node.name -eq 'psk:CustomMediaSize') { continue }
        $wNode = $node.SelectSingleNode("psf:ScoredProperty[@name='psk:MediaSizeWidth']/psf:Value", $ns)
        $hNode = $node.SelectSingleNode("psf:ScoredProperty[@name='psk:MediaSizeHeight']/psf:Value", $ns)
        if (-not $wNode -or -not $hNode) { continue }
        $w = 0.0; $h = 0.0
        if (-not [double]::TryParse($wNode.InnerText, [ref]$w)) { continue }
        if (-not [double]::TryParse($hNode.InnerText, [ref]$h)) { continue }
        $short = [Math]::Min($w, $h)
        $long = [Math]::Max($w, $h)
        if ([Math]::Abs($short - $targetShort) -gt 1500 -or [Math]::Abs($long - $targetLong) -gt 1500) {
            continue
        }
        $delta = [Math]::Abs($short - $targetShort) + [Math]::Abs($long - $targetLong)
        if ($delta -lt $bestDelta) {
            $bestDelta = $delta
            $bestNode = $node
        }
    }

    if ($bestNode) {
        return @{ Name = $bestNode.name; Node = $bestNode; Custom = $false }
    }
    $custom = Get-CapsOption $Caps 'psk:PageMediaSize' @('psk:CustomMediaSize')
    if ($custom) {
        return @{ Name = 'psk:CustomMediaSize'; Node = $custom; Custom = $true }
    }
    return $null
}

function Assert-TicketOption {
    param([xml]$Ticket, [string]$Feature, [string]$Expected, [string]$Label)
    $ns = Get-XmlNs $Ticket
    $node = $Ticket.SelectSingleNode("//psf:Feature[@name='$Feature']/psf:Option", $ns)
    if (-not $node) { throw "The printer dropped the $Label setting." }
    if ($node.name -ne $Expected) {
        throw "The printer changed the $Label setting from $Expected to $($node.name)."
    }
}

function Get-TicketSummary {
    param([System.Printing.PrintTicket]$Ticket)
    $stream = $Ticket.GetXmlStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $text = $reader.ReadToEnd()
    $reader.Dispose()
    $stream.Dispose()
    $xml = [xml]$text
    $ns = Get-XmlNs $xml
    $read = {
        param([string]$Feature)
        $node = $xml.SelectSingleNode("//psf:Feature[@name='$Feature']/psf:Option", $ns)
        if ($node) { return $node.name }
        return $null
    }
    return @{
        color = (& $read 'psk:PageOutputColor')
        quality = (& $read 'psk:PageOutputQuality')
        resolution = (& $read 'psk:PageResolution')
        paper = (& $read 'psk:PageMediaSize')
    }
}

function New-PrintTicket {
    param(
        [System.Printing.PrintQueue]$Queue,
        [bool]$Color,
        [string]$Quality,
        [bool]$Landscape,
        [string]$Duplex,
        [int]$Copies,
        [bool]$Collate,
        [int]$PaperRawKind,
        [int]$PaperWidth,
        [int]$PaperHeight,
        [xml]$Caps,
        [string]$DocumentName
    )

    $base = $Queue.DefaultPrintTicket
    $base.PageOrientation = if ($Landscape) {
        [System.Printing.PageOrientation]::Landscape
    } else {
        [System.Printing.PageOrientation]::Portrait
    }
    $base.Duplexing = switch ($Duplex) {
        'long' { [System.Printing.Duplexing]::TwoSidedLongEdge }
        'short' { [System.Printing.Duplexing]::TwoSidedShortEdge }
        default { [System.Printing.Duplexing]::OneSided }
    }
    $base.CopyCount = [Math]::Max(1, $Copies)
    $base.Collation = if ($Collate) {
        [System.Printing.Collation]::Collated
    } else {
        [System.Printing.Collation]::Uncollated
    }

    $colorName = if ($Color) { 'psk:Color' } else { 'psk:Monochrome' }
    $qualityPlan = Get-QualityPlan $Caps $Quality
    $resolutionPlan = Get-ResolutionPlan $Caps $Quality
    $mediaPlan = Get-MediaPlan $Caps $PaperWidth $PaperHeight

    $features = @()
    $features += "<psf:Feature name=`"psk:PageOutputColor`"><psf:Option name=`"$colorName`"/></psf:Feature>"
    if ($qualityPlan) {
        $features += "<psf:Feature name=`"psk:PageOutputQuality`"><psf:Option name=`"$($qualityPlan.Name)`"/></psf:Feature>"
    }
    if ($resolutionPlan) {
        $features += @"
<psf:Feature name="psk:PageResolution"><psf:Option name="$($resolutionPlan.Name)"><psf:ScoredProperty name="psk:ResolutionX"><psf:Value xsi:type="xsd:integer">$($resolutionPlan.X)</psf:Value></psf:ScoredProperty><psf:ScoredProperty name="psk:ResolutionY"><psf:Value xsi:type="xsd:integer">$($resolutionPlan.Y)</psf:Value></psf:ScoredProperty></psf:Option></psf:Feature>
"@
    }

    $deltaXml = @"
<?xml version="1.0"?>
<psf:PrintTicket xmlns:psf="http://schemas.microsoft.com/windows/2003/08/printing/printschemaframework" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:psk="http://schemas.microsoft.com/windows/2003/08/printing/printschemakeywords" xmlns:ns0000="http://schema.epson.net/printschema/business/v100" version="1">
$($features -join "`n")
</psf:PrintTicket>
"@

    # Media options are driver-private: the Epson driver only accepts the exact
    # option node it advertised in its capabilities (including any parameters),
    # and only if the read-only 'constrained' hint is stripped. Name-only XML
    # silently resolves back to the default paper. Build that feature with the
    # DOM so namespaces and xsi types survive verbatim.
    $deltaDoc = New-Object System.Xml.XmlDocument
    $deltaDoc.LoadXml($deltaXml)
    if ($mediaPlan) {
        $psfNs = 'http://schemas.microsoft.com/windows/2003/08/printing/printschemaframework'
        $mediaFeature = $deltaDoc.CreateElement('psf', 'Feature', $psfNs)
        [void]$mediaFeature.SetAttribute('name', 'psk:PageMediaSize')
        if ($mediaPlan.Custom) {
            # Custom paper expressions use microns, same as the score values.
            $mediaWidth = [Math]::Round($PaperWidth * 254.0, 0)
            $mediaHeight = [Math]::Round($PaperHeight * 254.0, 0)
            $customOption = $deltaDoc.CreateElement('psf', 'Option', $psfNs)
            [void]$customOption.SetAttribute('name', 'psk:CustomMediaSize')
            foreach ($pair in @(
                @{ Name = 'psk:MediaSizeWidth'; Value = $mediaWidth },
                @{ Name = 'psk:MediaSizeHeight'; Value = $mediaHeight }
            )) {
                $score = $deltaDoc.CreateElement('psf', 'ScoredProperty', $psfNs)
                [void]$score.SetAttribute('name', $pair.Name)
                $value = $deltaDoc.CreateElement('psf', 'Value', $psfNs)
                [void]$value.SetAttribute('xsi:type', 'xsd:double')
                $value.InnerText = [string]$pair.Value
                [void]$score.AppendChild($value)
                [void]$customOption.AppendChild($score)
            }
            [void]$mediaFeature.AppendChild($customOption)
        } else {
            $imported = $deltaDoc.ImportNode($mediaPlan.Node, $true)
            if ($imported.HasAttribute('constrained')) {
                $imported.RemoveAttribute('constrained')
            }
            [void]$mediaFeature.AppendChild($imported)
        }
        [void]$deltaDoc.DocumentElement.AppendChild($mediaFeature)
        $deltaXml = $deltaDoc.OuterXml
    }

    $stream = [System.IO.MemoryStream]::new([System.Text.Encoding]::UTF8.GetBytes($deltaXml))
    $delta = New-Object System.Printing.PrintTicket($stream)
    $result = $Queue.MergeAndValidatePrintTicket($base, $delta)
    $ticket = $result.ValidatedPrintTicket
    if (-not $ticket) { throw 'The printer could not validate the job settings.' }

    $ticketStream = $ticket.GetXmlStream()
    $reader = New-Object System.IO.StreamReader($ticketStream)
    $ticketText = $reader.ReadToEnd()
    $reader.Dispose()
    $ticketStream.Dispose()
    $ticketXml = [xml]$ticketText

    Assert-TicketOption $ticketXml 'psk:PageOutputColor' $colorName 'color'
    if ($qualityPlan) {
        Assert-TicketOption $ticketXml 'psk:PageOutputQuality' $qualityPlan.Name 'quality'
    }
    if ($resolutionPlan) {
        Assert-TicketOption $ticketXml 'psk:PageResolution' $resolutionPlan.Name 'resolution'
    }
    if ($mediaPlan) {
        Assert-TicketOption $ticketXml 'psk:PageMediaSize' $mediaPlan.Name 'paper size'
    }

    return $ticket
}

function New-FixedDocument {
    param(
        [string[]]$PagePaths,
        [double]$PageWidth,
        [double]$PageHeight,
        [double]$OriginX,
        [double]$OriginY,
        [double]$ExtentWidth,
        [double]$ExtentHeight,
        [double]$RenderDpi,
        [string]$Scale
    )

    $document = New-Object System.Windows.Documents.FixedDocument
    $safeDpi = if ($RenderDpi -gt 1.0) { $RenderDpi } else { 200.0 }
    if ($ExtentWidth -le 0 -or $ExtentHeight -le 0) {
        $ExtentWidth = $PageWidth - 24
        $ExtentHeight = $PageHeight - 24
        $OriginX = 12
        $OriginY = 12
    }

    foreach ($pagePath in $PagePaths) {
        $bitmap = New-Object System.Windows.Media.Imaging.BitmapImage
        $bitmap.BeginInit()
        $bitmap.UriSource = [Uri]::new($pagePath)
        $bitmap.CacheOption = [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad
        $bitmap.EndInit()
        $bitmap.Freeze()

        $pixelWidth = [double]$bitmap.PixelWidth
        $pixelHeight = [double]$bitmap.PixelHeight
        if ($pixelWidth -le 0 -or $pixelHeight -le 0) {
            throw "One of the rendered pages could not be read."
        }

        $drawWidth = 0.0
        $drawHeight = 0.0
        if ($Scale -eq 'fill') {
            $drawWidth = $ExtentWidth
            $drawHeight = $ExtentHeight
        } elseif ($Scale -eq 'actual') {
            $drawWidth = $pixelWidth / $safeDpi * 96.0
            $drawHeight = $pixelHeight / $safeDpi * 96.0
        } else {
            $ratio = [Math]::Min($ExtentWidth / $pixelWidth, $ExtentHeight / $pixelHeight)
            $drawWidth = $pixelWidth * $ratio
            $drawHeight = $pixelHeight * $ratio
        }

        $left = $OriginX + ($ExtentWidth - $drawWidth) / 2.0
        $top = $OriginY + ($ExtentHeight - $drawHeight) / 2.0

        $fixedPage = New-Object System.Windows.Documents.FixedPage
        $fixedPage.Width = $PageWidth
        $fixedPage.Height = $PageHeight
        $fixedPage.Background = [System.Windows.Media.Brushes]::White

        $image = New-Object System.Windows.Controls.Image
        $image.Source = $bitmap
        $image.Width = $drawWidth
        $image.Height = $drawHeight
        $image.Stretch = [System.Windows.Media.Stretch]::Fill
        [System.Windows.Media.RenderOptions]::SetBitmapScalingMode(
            $image,
            [System.Windows.Media.BitmapScalingMode]::HighQuality
        )
        [System.Windows.Documents.FixedPage]::SetLeft($image, $left)
        [System.Windows.Documents.FixedPage]::SetTop($image, $top)
        [void]$fixedPage.Children.Add($image)

        $pageContent = New-Object System.Windows.Documents.PageContent
        $pageContent.Child = $fixedPage
        [void]$document.Pages.Add($pageContent)
    }

    return $document
}

function Invoke-XpsPrint {
    param(
        [string]$PrinterName,
        [string[]]$PagePaths,
        [int]$Copies,
        [bool]$Collate,
        [bool]$Color,
        [string]$Quality,
        [bool]$Landscape,
        [string]$Duplex,
        [int]$PaperRawKind,
        [int]$PaperWidth,
        [int]$PaperHeight,
        [string]$Scale,
        [double]$RenderDpi,
        [string]$DocumentName,
        [string]$DryRunPath
    )

    Add-Type -AssemblyName System.Printing
    Add-Type -AssemblyName ReachFramework
    Add-Type -AssemblyName PresentationCore
    Add-Type -AssemblyName PresentationFramework
    Add-Type -AssemblyName WindowsBase

    $server = New-Object System.Printing.LocalPrintServer
    $queue = $null
    $job = $null
    try {
        $queue = $server.GetPrintQueue($PrinterName)
        if (-not $queue) { throw 'The printer queue could not be opened.' }

        $capsXml = (Get-PrintConfiguration -PrinterName $PrinterName).PrintCapabilitiesXML
        if (-not $capsXml) { throw 'The printer did not report its capabilities.' }
        $caps = [xml]$capsXml

        $ticket = New-PrintTicket `
            -Queue $queue `
            -Color $Color `
            -Quality $Quality `
            -Landscape $Landscape `
            -Duplex $Duplex `
            -Copies $Copies `
            -Collate $Collate `
            -PaperRawKind $PaperRawKind `
            -PaperWidth $PaperWidth `
            -PaperHeight $PaperHeight `
            -Caps $caps `
            -DocumentName $DocumentName

        $pageWidth = if ($PaperWidth -gt 0) { $PaperWidth / 100.0 * 96.0 } else { 793.7 }
        $pageHeight = if ($PaperHeight -gt 0) { $PaperHeight / 100.0 * 96.0 } else { 1122.5 }
        if ($Landscape) {
            $swap = $pageWidth
            $pageWidth = $pageHeight
            $pageHeight = $swap
        }

        $pageCaps = $queue.GetPrintCapabilities($ticket)
        $area = $pageCaps.PageImageableArea
        $originX = 12.0; $originY = 12.0
        $extentWidth = $pageWidth - 24.0; $extentHeight = $pageHeight - 24.0
        if ($area) {
            if ([double]$area.OriginWidth -ge 0) { $originX = [double]$area.OriginWidth }
            if ([double]$area.OriginHeight -ge 0) { $originY = [double]$area.OriginHeight }
            if ([double]$area.ExtentWidth -gt 0) { $extentWidth = [double]$area.ExtentWidth }
            if ([double]$area.ExtentHeight -gt 0) { $extentHeight = [double]$area.ExtentHeight }
        }

        $fixedDocument = New-FixedDocument `
            -PagePaths $PagePaths `
            -PageWidth $pageWidth `
            -PageHeight $pageHeight `
            -OriginX $originX `
            -OriginY $originY `
            -ExtentWidth $extentWidth `
            -ExtentHeight $extentHeight `
            -RenderDpi $RenderDpi `
            -Scale $Scale

        $summary = Get-TicketSummary $ticket

        # Build the XPS package through the file-based constructor. The
        # Package-backed constructor leaves the last compressed part
        # half-written when the package is closed in the same call stack.
        $xpsPath = if ($DryRunPath) {
            $DryRunPath
        } else {
            Join-Path ([System.IO.Path]::GetTempPath()) ("margin-xps-" + [Guid]::NewGuid().ToString('N') + ".xps")
        }

        try {
            $xps = New-Object System.Windows.Xps.Packaging.XpsDocument(
                $xpsPath,
                [System.IO.FileAccess]::ReadWrite
            )
            $writer = [System.Windows.Xps.Packaging.XpsDocument]::CreateXpsDocumentWriter($xps)
            try {
                $writer.Write($fixedDocument)
            } finally {
                $xps.Close()
            }

            # Never submit a truncated package. Reopen it and count the pages.
            $check = New-Object System.Windows.Xps.Packaging.XpsDocument(
                $xpsPath,
                [System.IO.FileAccess]::Read
            )
            try {
                $sequence = $check.GetFixedDocumentSequence()
                $writtenPages = 0
                foreach ($reference in $sequence.References) {
                    $writtenPages += $reference.GetDocument($false).Pages.Count
                }
            } finally {
                $check.Close()
            }
            if ($writtenPages -ne $PagePaths.Count) {
                throw "The XPS package contains $writtenPages pages instead of $($PagePaths.Count)."
            }

            if ($DryRunPath) {
                return @{
                    jobId = 0
                    mode = 'xps-dry-run'
                    xpsPath = $xpsPath
                    ticket = $summary
                }
            }

            $job = $queue.AddJob($DocumentName, $ticket)
            if (-not $job) { throw 'Windows did not create the print job.' }
            $jobId = $job.JobIdentifier

            $stream = $job.JobStream
            try {
                $fileStream = [System.IO.File]::OpenRead($xpsPath)
                try {
                    $fileStream.CopyTo($stream)
                } finally {
                    $fileStream.Dispose()
                }
            } finally {
                if ($stream) { $stream.Close() }
            }
        } finally {
            if (-not $DryRunPath) {
                Remove-Item -LiteralPath $xpsPath -Force -ErrorAction SilentlyContinue
            }
        }

        return @{ jobId = $jobId; mode = 'xps'; ticket = $summary }
    } catch {
        if ($job) {
            try { $job.Cancel() } catch { }
        }
        throw
    } finally {
        if ($queue) { $queue.Dispose() }
        $server.Dispose()
    }
}

try {
    if (-not (Test-Path -LiteralPath $ManifestPath)) {
        throw "Print manifest was not found."
    }

    Add-Type -AssemblyName System.Drawing
    Add-Type -TypeDefinition $csharp -ReferencedAssemblies @('System.dll', 'System.Core.dll', 'System.Drawing.dll')

    $manifest = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $pagePaths = @($manifest.pagePaths | ForEach-Object { [string]$_ })
    $outputPath = [string]$manifest.outputPath
    $dryRunPath = if ($DryRun) {
        [System.IO.Path]::ChangeExtension($ResultPath, '.xps')
    } else {
        ''
    }
    $xpsError = $null
    $mode = 'gdi'
    $jobId = 0

    # Prefer the XPS/PrintTicket path: it carries color and Epson's Fine/High
    # quality options through the driver. The GDI path stays as a fallback for
    # debug output and older Windows setups.
    if (-not $outputPath) {
        try {
            $xpsResult = Invoke-XpsPrint `
                -PrinterName ([string]$manifest.printer) `
                -PagePaths $pagePaths `
                -Copies ([int]$manifest.copies) `
                -Collate ([bool]$manifest.collate) `
                -Color ([bool]$manifest.color) `
                -Quality ([string]$manifest.quality) `
                -Landscape ([bool]$manifest.landscape) `
                -Duplex ([string]$manifest.duplex) `
                -PaperRawKind ([int]$manifest.paperRawKind) `
                -PaperWidth ([int]$manifest.paperWidth) `
                -PaperHeight ([int]$manifest.paperHeight) `
                -Scale ([string]$manifest.scale) `
                -RenderDpi ([double]$manifest.renderDpi) `
                -DocumentName ([string]$manifest.documentName) `
                -DryRunPath $dryRunPath
            $jobId = [int]$xpsResult.jobId
            $mode = [string]$xpsResult.mode
        } catch {
            $xpsError = $_.Exception.Message
            Write-Warning "XPS print path unavailable: $xpsError"
            if ($DryRun) { throw }
        }
    }

    if ($mode -eq 'gdi') {
        $jobId = [MarginNativePrinter]::Print(
            [string]$manifest.printer,
            [string[]]$pagePaths,
            [int]$manifest.copies,
            [bool]$manifest.collate,
            [bool]$manifest.color,
            [string]$manifest.quality,
            [bool]$manifest.landscape,
            [string]$manifest.duplex,
            [int]$manifest.paperRawKind,
            [int]$manifest.paperWidth,
            [int]$manifest.paperHeight,
            [int]$manifest.paperSourceRawKind,
            [string]$manifest.scale,
            [double]$manifest.renderDpi,
            [string]$manifest.documentName,
            [string]$manifest.outputPath
        )
    }

    Write-Result @{
        ok = $true
        jobId = $jobId
        mode = $mode
        xpsError = $xpsError
        ticket = $xpsResult.ticket
        pageCount = $pagePaths.Count
        spooledAt = (Get-Date).ToUniversalTime().ToString('o')
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
        script = $_.ScriptStackTrace
    }
    exit 1
}
