# Simulate WeChat Pay notify (local/test: mark order as paid, trigger commission, etc.)
# Usage: .\scripts\simulate-payment-notify.ps1 -OrderNo "ORDER_NO"
# Example: .\scripts\simulate-payment-notify.ps1 -OrderNo "MINI1764313616479JDMM"

param(
    [Parameter(Mandatory = $true, HelpMessage = "Order number (orderNo), same as when creating payment")]
    [string]$OrderNo,
    [string]$BaseUrl = "http://localhost:3000",
    [string]$TransactionId = ""
)

if ([string]::IsNullOrEmpty($TransactionId)) {
    $TransactionId = "SIM_" + (Get-Date -Format "yyyyMMddHHmmss")
}

$notifyUrl = "$BaseUrl/api/payment/wechat/notify"
$body = @{
    out_trade_no     = $OrderNo
    transaction_id   = $TransactionId
    trade_state      = "SUCCESS"
    trade_state_desc = "Simulated success"
} | ConvertTo-Json -Compress

Write-Host "Notify: POST $notifyUrl" -ForegroundColor Cyan
Write-Host "OrderNo: $OrderNo" -ForegroundColor Yellow
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri $notifyUrl -Method Post -Body $body -ContentType "application/json; charset=utf-8" -TimeoutSec 15
    Write-Host "[OK] Notify handled:" -ForegroundColor Green
    $response | ConvertTo-Json
} catch {
    $statusCode = $null
    if ($_.Exception.Response) { $statusCode = [int]$_.Exception.Response.StatusCode }
    Write-Host "[FAIL] Request failed (HTTP $statusCode): $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message }
    exit 1
}
