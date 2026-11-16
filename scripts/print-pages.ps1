param(
    [Parameter(Mandatory = $true)]
    [string]$ManifestPath,
    [Parameter(Mandatory = $true)]
    [string]$ResultPath
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

try {
    if (-not (Test-Path -LiteralPath $ManifestPath)) {
        throw "Print manifest was not found."
    }

    Add-Type -AssemblyName System.Drawing
    Add-Type -TypeDefinition $csharp -ReferencedAssemblies @('System.dll', 'System.Core.dll', 'System.Drawing.dll')

    $manifest = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $pagePaths = @($manifest.pagePaths | ForEach-Object { [string]$_ })

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

    Write-Result @{
        ok = $true
        jobId = $jobId
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
    }
    exit 1
}
