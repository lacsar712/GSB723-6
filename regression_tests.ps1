$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$BASE = 'http://localhost:8006/api'
$results = New-Object System.Collections.ArrayList

function Login($name, $pass) {
  $body = @{ name = $name; password = $pass } | ConvertTo-Json
  $r = Invoke-RestMethod -Uri "$BASE/auth/login" -Method Post -Body $body -ContentType 'application/json'
  return @{ token = $r.token; agent = $r.agent; headers = @{ Authorization = "Bearer $($r.token)"; 'Content-Type' = 'application/json' } }
}

function Call($method, $path, $ctx, $body = $null) {
  $uri = "$BASE$path"
  $hdr = $ctx.headers
  try {
    if ($body -ne $null) {
      $b = $body | ConvertTo-Json -Depth 10
      $resp = Invoke-WebRequest -Uri $uri -Method $method -Headers $hdr -Body $b -UseBasicParsing
    } else {
      $resp = Invoke-WebRequest -Uri $uri -Method $method -Headers $hdr -UseBasicParsing
    }
    $ct = $resp.Headers['Content-Type']
    if ($ct -and $ct -like '*json*') {
      return @{ status = [int]$resp.StatusCode; data = ($resp.Content | ConvertFrom-Json); raw = $resp.Content }
    }
    return @{ status = [int]$resp.StatusCode; data = $null; raw = $resp.Content; headers = $resp.Headers }
  } catch {
    $resp = $_.Exception.Response
    $code = 0; $txt = ''
    if ($resp) {
      $code = [int]$resp.StatusCode
      $stream = $resp.GetResponseStream()
      $sr = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
      $txt = $sr.ReadToEnd(); $sr.Close()
    } else {
      $txt = $_.Exception.Message
    }
    $j = $null; try { $j = $txt | ConvertFrom-Json } catch {}
    return @{ status = $code; data = $j; raw = $txt; error = $true }
  }
}

function Add($id, $desc, $passed, $evidence) {
  $script:results.Add([PSCustomObject]@{
    id = $id; desc = $desc; passed = $passed; evidence = $evidence
  }) | Out-Null
}

Write-Host "=== Logging in as admin ==="
$admin = Login 'admin' '123456'
$admin.agent | ConvertTo-Json | Write-Host
Write-Host "=== Logging in as agent-a ==="
$a = Login 'agent-a' '123456'
$a.agent | ConvertTo-Json | Write-Host
Write-Host "=== Logging in as agent-b ==="
$b = Login 'agent-b' '123456'

$appsA = Call 'GET' '/apps' $a
$appA = $appsA.data[0]
Write-Host "agent-a app: $($appA.id) $($appA.name)"

$beforeStats = Call 'GET' '/card-keys/revoke-stats?days=7' $a
Write-Host "before revoke-stats:"; $beforeStats.data | ConvertTo-Json | Write-Host

Write-Host "=== T1: generate 5 cards ==="
$gen = Call 'POST' '/card-keys/generate' $a @{ application_id = $appA.id; count = 5 }
Add 'T1' 'generate 5 cards OK' ($gen.status -eq 201 -and @($gen.data.codes).Count -eq 5) "status=$($gen.status), codes.Count=$( @($gen.data.codes).Count )"

$meAfterGen = Call 'GET' '/auth/me' $a
$usedAfterGen = $meAfterGen.data.card_quota_used

$newIds = @()
$listAfterGen = Call 'GET' '/card-keys?limit=20' $a
foreach ($it in $listAfterGen.data.items) { if ($it.status -eq 'unused' -and $gen.data.codes -contains $it.code) { $newIds += $it.id } }
Write-Host "new unused ids count: $($newIds.Count)"

Write-Host "=== T2: reason 4 chars rejected ==="
$r2 = Call 'POST' '/card-keys/revoke-batch' $a @{ ids = @($newIds[0]); reason = '1234' }
Add 'T2' 'reason 4 chars -> 400' ($r2.status -eq 400) "status=$($r2.status), error=$($r2.data.error)"

Write-Host "=== T3: reason 5 chars boundary OK ==="
$r3 = Call 'POST' '/card-keys/revoke-batch' $a @{ ids = @($newIds[0]); reason = '12345' }
Add 'T3' 'reason 5 chars revoke OK' ($r3.status -eq 200 -and $r3.data.success_count -eq 1) "status=$($r3.status), success_count=$($r3.data.success_count)"

Write-Host "=== T4: reason 101 chars rejected ==="
$long101 = 'a' * 101
$r4 = Call 'POST' '/card-keys/revoke-batch' $a @{ ids = @($newIds[1]); reason = $long101 }
Add 'T4' 'reason 101 chars -> 400' ($r4.status -eq 400) "status=$($r4.status)"

Write-Host "=== T5: mixed (revoked+unused) partial success ==="
$r5 = Call 'POST' '/card-keys/revoke-batch' $a @{ ids = @($newIds[0], $newIds[1]); reason = 'duplicate-revoke-test-9' }
Add 'T5' 'mixed partial success' ($r5.status -eq 200 -and $r5.data.success_count -eq 1 -and $r5.data.failed_count -eq 1) "success=$($r5.data.success_count), failed=$($r5.data.failed_count), failure=$($r5.data.failures[0].reason)"

Write-Host "=== T6: 51 ids rejected (max 50) ==="
$ids51 = 1..51
$r6 = Call 'POST' '/card-keys/revoke-batch' $a @{ ids = $ids51; reason = 'fifty-one-ids-exceed-limit' }
Add 'T6' '51 ids -> 400' ($r6.status -eq 400) "status=$($r6.status)"

Write-Host "=== T7: agent-b cannot revoke agent-a card ==="
$r7 = Call 'POST' '/card-keys/revoke-batch' $b @{ ids = @($newIds[2]); reason = 'cross-agent-revoke-test' }
Add 'T7' 'cross-agent fails' ($r7.status -eq 200 -and $r7.data.success_count -eq 0 -and $r7.data.failed_count -eq 1) "success=$($r7.data.success_count), reason=$($r7.data.failures[0].reason)"

Write-Host "=== T8: revoke-stats 7d increases ==="
$afterStats = Call 'GET' '/card-keys/revoke-stats?days=7' $a
Add 'T8' 'revoke-stats 7d' ($afterStats.status -eq 200 -and $afterStats.data.days -eq 7 -and $afterStats.data.count -ge $beforeStats.data.count) "before=$($beforeStats.data.count), after=$($afterStats.data.count)"

Write-Host "=== T9: days=abc defaults 7 ==="
$r9 = Call 'GET' '/card-keys/revoke-stats?days=abc' $a
Add 'T9' 'invalid days defaults 7' ($r9.status -eq 200 -and $r9.data.days -eq 7) "days=$($r9.data.days), count=$($r9.data.count)"

Write-Host "=== T10: days=200 clamped to 90 ==="
$r10 = Call 'GET' '/card-keys/revoke-stats?days=200' $a
Add 'T10' 'days>90 clamped 90' ($r10.status -eq 200 -and $r10.data.days -eq 90) "days=$($r10.data.days)"

Write-Host "=== T11: CSV export returns BOM ==="
$r11raw = Call 'GET' '/card-keys/export' $a
$bytes = [System.Text.Encoding]::UTF8.GetBytes($r11raw.raw)
$hasBom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
Add 'T11' 'CSV has UTF-8 BOM' ($r11raw.status -eq 200 -and $hasBom) "status=$($r11raw.status), hasBom=$hasBom"

Write-Host "=== T12: quota refund = success_count ==="
$meAfter = Call 'GET' '/auth/me' $a
$usedAfter = $meAfter.data.card_quota_used
$refund = $usedAfterGen - $usedAfter
Add 'T12' 'quota refund = 2' ($refund -eq 2) "used afterGen=$usedAfterGen, afterRevokes=$usedAfter, refund=$refund"

Write-Host "=== T13: no token -> 401 ==="
try {
  $r13 = Invoke-WebRequest -Uri "$BASE/card-keys/revoke-stats" -UseBasicParsing
  Add 'T13' 'no token 401' $false "status=$($r13.StatusCode)"
} catch {
  $code = [int]$_.Exception.Response.StatusCode
  Add 'T13' 'no token 401' ($code -eq 401) "status=$code"
}

Write-Host "=== T14: filter status=revoked+keyword ==="
$revokedList = Call 'GET' '/card-keys?status=revoked&limit=5' $a
$revokedCode = $revokedList.data.items[0].code
$kw = $revokedCode.Substring(0, [Math]::Min(10, $revokedCode.Length))
$r14 = Call 'GET' "/card-keys?status=revoked&keyword=$kw" $a
Add 'T14' 'filter status+keyword' ($r14.status -eq 200 -and @($r14.data.items).Count -ge 1) "kw=$kw, total=$($r14.data.total), items=$(@($r14.data.items).Count)"

Write-Host "=== T15: generate count=0 rejected ==="
$r15 = Call 'POST' '/card-keys/generate' $a @{ application_id = $appA.id; count = 0 }
Add 'T15' 'generate 0 -> 400' ($r15.status -eq 400) "status=$($r15.status)"

Write-Host ""
Write-Host "================ RESULTS ================"
$pass = 0; $fail = 0
foreach ($r in $results) {
  $flag = if ($r.passed) { 'PASS' } else { 'FAIL' }
  if ($r.passed) { $pass++ } else { $fail++ }
  Write-Host ("[{0}] {1} - {2}" -f $flag, $r.id, $r.desc) -ForegroundColor $(if ($r.passed) {'Green'} else {'Red'})
  Write-Host ("       evidence: {0}" -f $r.evidence) -ForegroundColor Gray
}
Write-Host ""
Write-Host ("TOTAL: {0} PASS, {1} FAIL" -f $pass, $fail) -ForegroundColor $(if ($fail -eq 0) {'Green'} else {'Red'})

$results | ConvertTo-Json -Depth 5 | Out-File -FilePath 'd:\lzg\document\byteCode\GSB\GSB723-6\_regression_results.json' -Encoding utf8
