# 微信支付测试脚本
# 用于测试微信支付对接流程

param(
    [string]$BaseUrl = "http://localhost:3000",
    [int]$OrderId = 0
)

Write-Host "=== 微信支付测试脚本 ===" -ForegroundColor Green
Write-Host ""

# 检查参数
if ($OrderId -eq 0) {
    Write-Host "用法: .\test-wechat-payment.ps1 -OrderId <订单ID>" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "示例:" -ForegroundColor Cyan
    Write-Host "  .\test-wechat-payment.ps1 -OrderId 123" -ForegroundColor Gray
    Write-Host ""
    Write-Host "注意: 需要先创建订单，然后使用订单ID进行支付测试" -ForegroundColor Yellow
    exit 1
}

# 1. 小程序用户登录（模拟）
Write-Host "1. 小程序用户登录..." -ForegroundColor Yellow
Write-Host "   注意: 实际测试需要真实的小程序登录code" -ForegroundColor Gray
Write-Host "   这里使用模拟方式，实际应调用: POST $BaseUrl/api/auth/miniapp-login" -ForegroundColor Gray
Write-Host ""

# 2. 创建支付订单
Write-Host "2. 创建微信支付订单..." -ForegroundColor Yellow
Write-Host "   订单ID: $OrderId" -ForegroundColor Gray

$createPayBody = @{
    orderId = $OrderId
} | ConvertTo-Json

Write-Host ""
Write-Host "请求:" -ForegroundColor Cyan
Write-Host "POST $BaseUrl/api/payment/wechat/create" -ForegroundColor Gray
Write-Host $createPayBody -ForegroundColor Gray
Write-Host ""

Write-Host "提示: 实际测试需要:" -ForegroundColor Yellow
Write-Host "1. 配置微信支付商户号 (WX_MCHID)" -ForegroundColor Gray
Write-Host "2. 配置API密钥 (WX_PAY_KEY)" -ForegroundColor Gray
Write-Host "3. 上传证书文件 (apiclient_cert.pem, apiclient_key.pem)" -ForegroundColor Gray
Write-Host "4. 在小程序中调用此接口获取支付参数" -ForegroundColor Gray
Write-Host "5. 使用 wx.requestPayment() 调起支付" -ForegroundColor Gray
Write-Host ""

# 3. 查询支付状态
Write-Host "3. 查询支付状态..." -ForegroundColor Yellow
Write-Host "GET $BaseUrl/api/payment/wechat/query/$OrderId" -ForegroundColor Gray
Write-Host ""

Write-Host "=== 测试说明 ===" -ForegroundColor Green
Write-Host ""
Write-Host "完整测试流程:" -ForegroundColor Yellow
Write-Host "1. 在小程序中创建订单" -ForegroundColor White
Write-Host "2. 调用创建支付接口获取支付参数" -ForegroundColor White
Write-Host "3. 使用支付参数调起微信支付" -ForegroundColor White
Write-Host "4. 支付完成后查询订单状态" -ForegroundColor White
Write-Host ""
Write-Host "详细文档请查看: WECHAT_PAYMENT_GUIDE.md" -ForegroundColor Cyan
