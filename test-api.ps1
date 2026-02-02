# API Test Script
# Usage: .\test-api.ps1

$baseUrl = "http://localhost:3000"
$adminUsername = "admin"
$adminPassword = "admin123"

$global:adminToken = $null

function Write-TestHeader {
    param([string]$title)
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  $title" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
}

function Write-TestResult {
    param([string]$name, [bool]$success, [string]$message = "")
    if ($success) {
        Write-Host "[OK] $name" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] $name" -ForegroundColor Red
        if ($message) {
            Write-Host "      $message" -ForegroundColor Yellow
        }
    }
}

function Invoke-ApiRequest {
    param(
        [string]$method,
        [string]$url,
        [hashtable]$headers = @{},
        [object]$body = $null
    )
    
    try {
        $params = @{
            Method = $method
            Uri = $url
            Headers = $headers
            ContentType = "application/json"
            ErrorAction = "Stop"
        }
        
        if ($body) {
            $params.Body = ($body | ConvertTo-Json -Depth 10)
        }
        
        $response = Invoke-RestMethod @params
        return @{
            Success = $true
            Data = $response
            StatusCode = 200
        }
    } catch {
        $statusCode = 500
        if ($_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode.value__
        }
        return @{
            Success = $false
            Error = $_.Exception.Message
            StatusCode = $statusCode
        }
    }
}

function Test-HealthCheck {
    Write-TestHeader "1. Health Check"
    
    $result = Invoke-ApiRequest -method "GET" -url "$baseUrl/health"
    
    if ($result.Success -and $result.Data.status -eq "ok") {
        Write-TestResult "Health Check" $true
        return $true
    } else {
        Write-TestResult "Health Check" $false "Service may not be running"
        return $false
    }
}

function Test-AdminLogin {
    Write-TestHeader "2. Admin Login"
    
    $body = @{
        username = $adminUsername
        password = $adminPassword
    }
    
    $result = Invoke-ApiRequest -method "POST" -url "$baseUrl/api/auth/login" -body $body
    
    if ($result.Success -and $result.Data.code -eq 0) {
        $script:adminToken = $result.Data.data.token
        Write-TestResult "Admin Login" $true "Token obtained"
        return $true
    } else {
        Write-TestResult "Admin Login" $false $result.Error
        return $false
    }
}

function Test-GetCurrentUser {
    Write-TestHeader "3. Get Current User"
    
    if (-not $adminToken) {
        Write-TestResult "Get Current User" $false "No token available"
        return $false
    }
    
    $headers = @{
        "Authorization" = "Bearer $adminToken"
    }
    
    $result = Invoke-ApiRequest -method "GET" -url "$baseUrl/api/auth/me" -headers $headers
    
    if ($result.Success -and $result.Data.code -eq 0) {
        Write-TestResult "Get Current User" $true "User: $($result.Data.data.username)"
        return $true
    } else {
        Write-TestResult "Get Current User" $false $result.Error
        return $false
    }
}

function Test-GetProducts {
    Write-TestHeader "4. Get Products List"
    
    if (-not $adminToken) {
        Write-TestResult "Get Products" $false "No token available"
        return $false
    }
    
    $headers = @{
        "Authorization" = "Bearer $adminToken"
    }
    
    $result = Invoke-ApiRequest -method "GET" -url "$baseUrl/api/products?page=1&limit=10" -headers $headers
    
    if ($result.Success -and $result.Data.code -eq 0) {
        $count = $result.Data.data.products.Count
        Write-TestResult "Get Products" $true "Found $count products"
        return $true
    } else {
        Write-TestResult "Get Products" $false $result.Error
        return $false
    }
}

function Test-GetCategories {
    Write-TestHeader "5. Get Categories List"
    
    if (-not $adminToken) {
        Write-TestResult "Get Categories" $false "No token available"
        return $false
    }
    
    $headers = @{
        "Authorization" = "Bearer $adminToken"
    }
    
    $result = Invoke-ApiRequest -method "GET" -url "$baseUrl/api/categories?page=1&limit=10" -headers $headers
    
    if ($result.Success -and $result.Data.code -eq 0) {
        $count = $result.Data.data.categories.Count
        Write-TestResult "Get Categories" $true "Found $count categories"
        return $true
    } else {
        Write-TestResult "Get Categories" $false $result.Error
        return $false
    }
}

function Test-GetMiniappProducts {
    Write-TestHeader "6. Get Miniapp Products (No Auth Required)"
    
    $result = Invoke-ApiRequest -method "GET" -url "$baseUrl/api/miniapp/products?page=1&limit=10"
    
    if ($result.Success -and $result.Data.code -eq 0) {
        $count = $result.Data.data.products.Count
        Write-TestResult "Get Miniapp Products" $true "Found $count products"
        return $true
    } else {
        Write-TestResult "Get Miniapp Products" $false $result.Error
        return $false
    }
}

function Test-GetMiniappCategories {
    Write-TestHeader "7. Get Miniapp Categories (No Auth Required)"
    
    $result = Invoke-ApiRequest -method "GET" -url "$baseUrl/api/miniapp/categories"
    
    if ($result.Success -and $result.Data.code -eq 0) {
        $count = $result.Data.data.categories.Count
        Write-TestResult "Get Miniapp Categories" $true "Found $count categories"
        return $true
    } else {
        Write-TestResult "Get Miniapp Categories" $false $result.Error
        return $false
    }
}

function Test-GetMembers {
    Write-TestHeader "8. Get Members List"
    
    if (-not $adminToken) {
        Write-TestResult "Get Members" $false "No token available"
        return $false
    }
    
    $headers = @{
        "Authorization" = "Bearer $adminToken"
    }
    
    $result = Invoke-ApiRequest -method "GET" -url "$baseUrl/api/members?page=1&limit=10" -headers $headers
    
    if ($result.Success -and $result.Data.code -eq 0) {
        $count = $result.Data.data.members.Count
        Write-TestResult "Get Members" $true "Found $count members"
        return $true
    } else {
        Write-TestResult "Get Members" $false $result.Error
        return $false
    }
}

function Test-GetOrders {
    Write-TestHeader "9. Get Orders (Need Member ID)"
    
    if (-not $adminToken) {
        Write-TestResult "Get Orders" $false "No token available"
        return $false
    }
    
    $headers = @{
        "Authorization" = "Bearer $adminToken"
    }
    
    $result = Invoke-ApiRequest -method "GET" -url "$baseUrl/api/members?page=1&limit=1" -headers $headers
    
    if ($result.Success -and $result.Data.code -eq 0 -and $result.Data.data.members.Count -gt 0) {
        $memberId = $result.Data.data.members[0].id
        $orderResult = Invoke-ApiRequest -method "GET" -url "$baseUrl/api/orders/member/$memberId?page=1&limit=10" -headers $headers
        
        if ($orderResult.Success) {
            Write-TestResult "Get Orders" $true "Member ID: $memberId"
            return $true
        } else {
            Write-TestResult "Get Orders" $false $orderResult.Error
            return $false
        }
    } else {
        Write-TestResult "Get Orders" $false "No members found to test orders"
        return $false
    }
}

function Test-GetMemberLevels {
    Write-TestHeader "10. Get Member Levels"
    
    if (-not $adminToken) {
        Write-TestResult "Get Member Levels" $false "No token available"
        return $false
    }
    
    $headers = @{
        "Authorization" = "Bearer $adminToken"
    }
    
    $result = Invoke-ApiRequest -method "GET" -url "$baseUrl/api/member-levels" -headers $headers
    
    if ($result.Success -and $result.Data.code -eq 0) {
        $count = $result.Data.data.memberLevels.Count
        Write-TestResult "Get Member Levels" $true "Found $count levels"
        return $true
    } else {
        Write-TestResult "Get Member Levels" $false $result.Error
        return $false
    }
}

function Test-GetDistributorLevels {
    Write-TestHeader "11. Get Distributor Levels"
    
    if (-not $adminToken) {
        Write-TestResult "Get Distributor Levels" $false "No token available"
        return $false
    }
    
    $headers = @{
        "Authorization" = "Bearer $adminToken"
    }
    
    $result = Invoke-ApiRequest -method "GET" -url "$baseUrl/api/distributor-levels" -headers $headers
    
    if ($result.Success -and $result.Data.code -eq 0) {
        $count = $result.Data.data.distributorLevels.Count
        Write-TestResult "Get Distributor Levels" $true "Found $count levels"
        return $true
    } else {
        Write-TestResult "Get Distributor Levels" $false $result.Error
        return $false
    }
}

function Test-GetBanners {
    Write-TestHeader "12. Get Banners"
    
    if (-not $adminToken) {
        Write-TestResult "Get Banners" $false "No token available"
        return $false
    }
    
    $headers = @{
        "Authorization" = "Bearer $adminToken"
    }
    
    $result = Invoke-ApiRequest -method "GET" -url "$baseUrl/api/banners" -headers $headers
    
    if ($result.Success -and $result.Data.code -eq 0) {
        $count = $result.Data.data.banners.Count
        Write-TestResult "Get Banners" $true "Found $count banners"
        return $true
    } else {
        Write-TestResult "Get Banners" $false $result.Error
        return $false
    }
}

function Test-GetPublicBanners {
    Write-TestHeader "13. Get Public Banners (No Auth Required)"
    
    $result = Invoke-ApiRequest -method "GET" -url "$baseUrl/api/banners/public/1"
    
    if ($result.Success) {
        Write-TestResult "Get Public Banners" $true
        return $true
    } else {
        Write-TestResult "Get Public Banners" $false $result.Error
        return $false
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  MMBS-16 API Test Suite" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Base URL: $baseUrl" -ForegroundColor Yellow
Write-Host "Admin Username: $adminUsername" -ForegroundColor Yellow
Write-Host ""

$results = @()

$results += Test-HealthCheck
if (-not $results[-1]) {
    Write-Host ""
    Write-Host "Service is not running. Please start the server first." -ForegroundColor Red
    exit 1
}

$results += Test-AdminLogin
if (-not $results[-1]) {
    Write-Host ""
    Write-Host "Admin login failed. Please check credentials." -ForegroundColor Red
    exit 1
}

$results += Test-GetCurrentUser
$results += Test-GetProducts
$results += Test-GetCategories
$results += Test-GetMiniappProducts
$results += Test-GetMiniappCategories
$results += Test-GetMembers
$results += Test-GetOrders
$results += Test-GetMemberLevels
$results += Test-GetDistributorLevels
$results += Test-GetBanners
$results += Test-GetPublicBanners

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Test Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$passed = ($results | Where-Object { $_ -eq $true }).Count
$failed = ($results | Where-Object { $_ -eq $false }).Count
$total = $results.Count

Write-Host "Total Tests: $total" -ForegroundColor White
Write-Host "Passed: $passed" -ForegroundColor Green
Write-Host "Failed: $failed" -ForegroundColor Red
Write-Host ""

if ($failed -eq 0) {
    Write-Host "All tests passed!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "Some tests failed. Please check the output above." -ForegroundColor Yellow
    exit 1
}

