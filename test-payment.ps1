# 支付测试脚本
# 用于快速测试支付功能

param(
    [string]$BaseUrl = "http://localhost:3000",
    [int]$MemberId = 1,
    [int]$ProductId = 1,
    [int]$Quantity = 1,
    [decimal]$UnitPrice = 99.00
)

Write-Host "=== 支付测试脚本 ===" -ForegroundColor Green
Write-Host ""

# 计算总金额
$TotalAmount = $Quantity * $UnitPrice

# 1. 管理员登录
Write-Host "1. 管理员登录..." -ForegroundColor Yellow
$loginBody = @{
    username = "admin"
    password = "admin123"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body $loginBody
    
    if ($loginResponse.code -eq 0) {
        $token = $loginResponse.data.token
        Write-Host "   登录成功！Token: $($token.Substring(0, 20))..." -ForegroundColor Green
    } else {
        Write-Host "   登录失败: $($loginResponse.message)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "   登录失败: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 2. 创建测试订单
Write-Host "2. 创建测试订单..." -ForegroundColor Yellow
Write-Host "   会员ID: $MemberId" -ForegroundColor Gray
Write-Host "   商品ID: $ProductId" -ForegroundColor Gray
Write-Host "   数量: $Quantity" -ForegroundColor Gray
Write-Host "   单价: $UnitPrice" -ForegroundColor Gray
Write-Host "   总金额: $TotalAmount" -ForegroundColor Gray

$orderBody = @{
    memberId = $MemberId
    productId = $ProductId
    quantity = $Quantity
    unitPrice = $UnitPrice
    totalAmount = $TotalAmount
} | ConvertTo-Json

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

try {
    $orderResponse = Invoke-RestMethod -Uri "$BaseUrl/api/orders/test" `
        -Method POST `
        -Headers $headers `
        -Body $orderBody
    
    if ($orderResponse.code -eq 0) {
        $order = $orderResponse.data.order
        $orderId = $order.id
        Write-Host "   订单创建成功！" -ForegroundColor Green
        Write-Host "   订单ID: $orderId" -ForegroundColor Cyan
        Write-Host "   订单号: $($order.orderNo)" -ForegroundColor Cyan
        Write-Host "   订单状态: $($order.status)" -ForegroundColor Cyan
        Write-Host "   支付方式: $($order.paymentMethod)" -ForegroundColor Cyan
        Write-Host "   支付时间: $($order.paymentTime)" -ForegroundColor Cyan
    } else {
        Write-Host "   订单创建失败: $($orderResponse.message)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "   订单创建失败: $_" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "   错误详情: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    exit 1
}

Write-Host ""

# 3. 查询订单详情
Write-Host "3. 查询订单详情..." -ForegroundColor Yellow
try {
    $detailResponse = Invoke-RestMethod -Uri "$BaseUrl/api/orders/$orderId" `
        -Method GET `
        -Headers $headers
    
    if ($detailResponse.code -eq 0) {
        $orderDetail = $detailResponse.data.order
        Write-Host "   订单查询成功！" -ForegroundColor Green
        Write-Host "   订单状态: $($orderDetail.status)" -ForegroundColor Cyan
        Write-Host "   支付方式: $($orderDetail.paymentMethod)" -ForegroundColor Cyan
        Write-Host "   总金额: $($orderDetail.totalAmount)" -ForegroundColor Cyan
        
        if ($orderDetail.status -eq "paid") {
            Write-Host "   ✓ 订单已支付" -ForegroundColor Green
        } else {
            Write-Host "   ✗ 订单未支付" -ForegroundColor Red
        }
    } else {
        Write-Host "   订单查询失败: $($detailResponse.message)" -ForegroundColor Red
    }
} catch {
    Write-Host "   订单查询失败: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== 测试完成 ===" -ForegroundColor Green
Write-Host ""
Write-Host "提示：" -ForegroundColor Yellow
Write-Host "- 可以在管理后台查看订单详情" -ForegroundColor Gray
Write-Host "- 订单号: $($order.orderNo)" -ForegroundColor Gray
Write-Host "- 访问: $BaseUrl" -ForegroundColor Gray
