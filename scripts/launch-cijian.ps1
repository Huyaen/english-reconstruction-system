# 词间 v1.0.0 启动器：固定 origin http://localhost:4173
# 说明：origin 必须固定，否则浏览器的 IndexedDB 会变成另一个库，用户会以为数据丢了。
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$url = 'http://localhost:4173/'

function Test-CiJian {
    try {
        $r = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2
        return ($r.Content -match '词间')
    } catch { return $false }
}
function Test-PortBusy {
    try {
        $c = New-Object Net.Sockets.TcpClient
        $c.Connect('127.0.0.1', 4173)
        $c.Close()
        return $true
    } catch { return $false }
}

Write-Host ''
Write-Host '  词间 · 把词留在记忆里' -ForegroundColor Cyan
Write-Host '  本地学习空间，数据只存在这台电脑的浏览器里'
Write-Host ''

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host '  [X] 没有找到 Node.js。请先安装 Node.js 18 或更高版本，再双击本文件。' -ForegroundColor Red
    Read-Host '按回车关闭'
    exit 1
}
if (-not (Test-Path (Join-Path $root 'dist\index.html'))) {
    Write-Host '  [X] 没有找到 dist\index.html，发布包不完整。' -ForegroundColor Red
    Read-Host '按回车关闭'
    exit 1
}

if (Test-CiJian) {
    Write-Host '  服务已在运行，正在打开浏览器……'
    Start-Process $url
    Start-Sleep -Seconds 1
    exit 0
}

if (Test-PortBusy) {
    Write-Host '  [!] 端口 4173 被别的程序占用了，无法启动。' -ForegroundColor Yellow
    Write-Host '      先运行「停止词间.cmd」，或关掉占用 4173 的程序，再重试。'
    Read-Host '按回车关闭'
    exit 1
}

Write-Host '  正在启动本地服务……'
$log = Join-Path $root 'cijian-server.log'
Start-Process -FilePath 'node' -ArgumentList 'server.mjs','--dir=dist','--port=4173' -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError "$log.err"

for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 700
    if (Test-CiJian) {
        Write-Host '  已就绪，正在打开浏览器：' $url -ForegroundColor Green
        Start-Process $url
        Start-Sleep -Seconds 1
        exit 0
    }
}

Write-Host '  [X] 服务没有起来。日志：cijian-server.log / cijian-server.log.err' -ForegroundColor Red
Read-Host '按回车关闭'
exit 1
