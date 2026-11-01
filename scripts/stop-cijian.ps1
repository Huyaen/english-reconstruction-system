# 停止词间的本地服务（只停 server.mjs，不动其他 node 进程）
$procs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -match 'server\.mjs' -and $_.CommandLine -match '4173' }
if ($procs) {
    $procs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Write-Host '  已停止词间本地服务' -ForegroundColor Green
} else {
    Write-Host '  没有找到正在运行的服务'
}
Start-Sleep -Seconds 1
