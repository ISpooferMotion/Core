param(
    [string]$OutDir = "",
    [string]$Name = ""
)

$ErrorActionPreference = "Stop"

$root = [System.IO.Path]::GetFullPath($PSScriptRoot)

if ([string]::IsNullOrWhiteSpace($OutDir)) {
    $OutDir = Split-Path -Path $root -Parent
}

if (-not (Test-Path -LiteralPath $OutDir)) {
    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
}

$OutDir = (Resolve-Path -LiteralPath $OutDir).Path

if ([string]::IsNullOrWhiteSpace($Name)) {
    $folderName = Split-Path -Path $root -Leaf
    $timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
    $Name = "${folderName}_${timestamp}"
}

if (-not $Name.EndsWith(
        ".zip",
        [System.StringComparison]::OrdinalIgnoreCase
    )) {
    $Name = "$Name.zip"
}

$zipPath = Join-Path $OutDir $Name
$normalizedZipPath = [System.IO.Path]::GetFullPath($zipPath)

$excludedDirs = @(
    ".git",
    ".svn",
    ".hg",

    "node_modules",

    "target",

    "build",
    "dist",
    "out",

    ".next",
    ".nuxt",
    ".svelte-kit",

    ".cache",
    ".parcel-cache",
    ".turbo",

    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",

    ".venv",
    "venv",

    ".idea",

    "bin",
    "obj"
)

$excludedDirsSet = New-Object `
    "System.Collections.Generic.HashSet[string]" `
([System.StringComparer]::OrdinalIgnoreCase)

foreach ($dir in $excludedDirs) {
    [void]$excludedDirsSet.Add($dir)
}

Write-Host ""
Write-Host "Packaging:" -ForegroundColor Cyan
Write-Host "   Root   : $root"
Write-Host "   Output : $zipPath"
Write-Host ""

$rootPrefix = $root.TrimEnd([char[]]@('\', '/')) +
[System.IO.Path]::DirectorySeparatorChar

$files = New-Object "System.Collections.Generic.List[object]"

Get-ChildItem `
    -LiteralPath $root `
    -Recurse `
    -File `
    -Force `
    -ErrorAction SilentlyContinue |
ForEach-Object {
    $file = $_
    $fullPath = [System.IO.Path]::GetFullPath($file.FullName)

    if ($fullPath.Equals(
            $normalizedZipPath,
            [System.StringComparison]::OrdinalIgnoreCase
        )) {
        return
    }

    if (-not $fullPath.StartsWith(
            $rootPrefix,
            [System.StringComparison]::OrdinalIgnoreCase
        )) {
        return
    }

    $relativePath = $fullPath.Substring($rootPrefix.Length)
    $segments = $relativePath -split '[\\/]'

    foreach ($segment in $segments) {
        if ($excludedDirsSet.Contains($segment)) {
            return
        }
    }

    $entryName = $relativePath.Replace('\', '/')

    $files.Add([pscustomobject]@{
            FullName  = $fullPath
            EntryName = $entryName
        })
}

Write-Host "Found $($files.Count) files." -ForegroundColor Green

if ($files.Count -eq 0) {
    throw "No files were found to package."
}

if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zip = $null

try {
    $zip = [System.IO.Compression.ZipFile]::Open(
        $zipPath,
        [System.IO.Compression.ZipArchiveMode]::Create
    )

    foreach ($item in $files) {
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $zip,
            $item.FullName,
            $item.EntryName,
            [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
    }
}
finally {
    if ($null -ne $zip) {
        $zip.Dispose()
    }
}

$archive = Get-Item -LiteralPath $zipPath

$sizeMB = [math]::Round(
    $archive.Length / 1MB,
    2
)

Write-Host ""
Write-Host "Done!" -ForegroundColor Green
Write-Host "   Archive : $($archive.FullName)"
Write-Host "   Size    : $sizeMB MB"
Write-Host "   Files   : $($files.Count)"
Write-Host ""
