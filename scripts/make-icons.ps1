# Generates the plugin icons (48px / 96px PNG) with System.Drawing.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/make-icons.ps1

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'addon\content\icons'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function New-RoundedPath([int]$size, [double]$radius) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $radius * 2
    $path.AddArc(0, 0, $d, $d, 180, 90)
    $path.AddArc($size - $d, 0, $d, $d, 270, 90)
    $path.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
    $path.AddArc(0, $size - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

function New-Icon([int]$size, [string]$file) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.Color]::Transparent)

    $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rect,
        [System.Drawing.Color]::FromArgb(255, 43, 124, 255),
        [System.Drawing.Color]::FromArgb(255, 116, 74, 255),
        45.0)
    $shape = New-RoundedPath $size ($size * 0.22)
    $g.FillPath($brush, $shape)

    $font = New-Object System.Drawing.Font(
        'Microsoft YaHei UI',
        [single]($size * 0.54),
        [System.Drawing.FontStyle]::Bold,
        [System.Drawing.GraphicsUnit]::Pixel)
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $box = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
    $g.DrawString([string][char]0x8BD1, $font, [System.Drawing.Brushes]::White, $box, $format)

    $g.Dispose()
    $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host ("wrote {0} ({1} bytes)" -f $file, (Get-Item $file).Length)
}

New-Icon 48 (Join-Path $outDir 'icon-48.png')
New-Icon 96 (Join-Path $outDir 'icon-96.png')
