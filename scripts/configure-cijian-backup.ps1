$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$picker = New-Object Windows.Forms.FolderBrowserDialog
$picker.Description = '选择父文件夹。词间会在下面创建「词间本机自动备份」，保留最近 14 份。'
$root = Split-Path -Parent $PSScriptRoot
try {
    if ($picker.ShowDialog() -ne [Windows.Forms.DialogResult]::OK) { exit 0 }
    $selected = [IO.Path]::GetFullPath($picker.SelectedPath)
    $dest = Join-Path $selected '词间本机自动备份'
    $public = [IO.Path]::GetFullPath((Join-Path $root 'dist')).TrimEnd('\') + '\'
    if ($selected.StartsWith('\\') -or ($dest + '\').StartsWith($public, [StringComparison]::OrdinalIgnoreCase)) {
        throw '请选择本机文件夹，并避开词间的 dist 目录。'
    }
    $confirmation = [Windows.Forms.MessageBox]::Show("允许词间将学习数据写入以下目录？`n`n$dest", '词间 · 确认自动备份目录', 'OKCancel')
    if ($confirmation -ne [Windows.Forms.DialogResult]::OK) { exit 0 }
    [void][IO.Directory]::CreateDirectory($dest)
    $config = Join-Path $root '.cijian-backup-directory.json'
    $temp = Join-Path $root ('.cijian-backup-directory.' + [guid]::NewGuid().ToString('N') + '.tmp')
    $json = @{ directory = $dest } | ConvertTo-Json -Compress
    try {
        [IO.File]::WriteAllText($temp, $json, (New-Object Text.UTF8Encoding($false)))
        if ([IO.File]::Exists($config)) { [IO.File]::Replace($temp, $config, $null) }
        else { [IO.File]::Move($temp, $config) }
    } finally {
        if ([IO.File]::Exists($temp)) { [IO.File]::Delete($temp) }
    }
    [void][Windows.Forms.MessageBox]::Show('目录已保存。打开词间 → 设置 → 自动备份，点击「启用本机备份」。', '词间 · 本机备份')
} catch {
    [void][Windows.Forms.MessageBox]::Show('无法保存目录。请检查文件夹是否可写，再重新选择。', '词间 · 本机备份')
    exit 1
} finally { $picker.Dispose() }
