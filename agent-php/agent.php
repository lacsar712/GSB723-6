<?php
declare(strict_types=1);

session_start();

$backend = getenv('BACKEND_URL');
if (!$backend) {
  $backend = 'http://backend:8006';
}

function api_request(string $backend, string $method, string $path, ?string $token, ?array $payload): array {
  $url = rtrim($backend, '/') . $path;
  $ch = curl_init($url);
  $headers = [
    'Accept: application/json'
  ];
  if ($token) {
    $headers[] = 'Authorization: Bearer ' . $token;
  }
  if ($payload !== null) {
    $headers[] = 'Content-Type: application/json';
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload, JSON_UNESCAPED_UNICODE));
  }
  curl_setopt($ch, CURLOPT_CUSTOMREQUEST, strtoupper($method));
  curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_TIMEOUT, 15);

  $raw = curl_exec($ch);
  $err = curl_error($ch);
  $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);

  if ($raw === false) {
    return ['ok' => false, 'status' => 0, 'error' => $err ?: 'request failed'];
  }

  $data = json_decode($raw, true);
  if (!is_array($data)) {
    $data = ['raw' => $raw];
  }

  if ($status < 200 || $status >= 300) {
    $msg = '';
    if (isset($data['error']) && is_string($data['error'])) $msg = $data['error'];
    if (!$msg && isset($data['message']) && is_string($data['message'])) $msg = $data['message'];
    if (!$msg) $msg = 'HTTP ' . $status;
    return ['ok' => false, 'status' => $status, 'error' => $msg, 'data' => $data];
  }

  return ['ok' => true, 'status' => $status, 'data' => $data];
}

function redirect_to_self(): void {
  header('Location: agent.php');
  exit;
}

if (isset($_GET['action']) && $_GET['action'] === 'logout') {
  $_SESSION = [];
  if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
  }
  session_destroy();
  redirect_to_self();
}

$token = isset($_SESSION['token']) && is_string($_SESSION['token']) ? $_SESSION['token'] : null;
$flash_error = isset($_SESSION['flash_error']) && is_string($_SESSION['flash_error']) ? $_SESSION['flash_error'] : null;
$flash_codes = isset($_SESSION['flash_codes']) && is_array($_SESSION['flash_codes']) ? $_SESSION['flash_codes'] : [];
$flash_app = isset($_SESSION['flash_app']) && is_string($_SESSION['flash_app']) ? $_SESSION['flash_app'] : '';
unset($_SESSION['flash_error'], $_SESSION['flash_codes'], $_SESSION['flash_app']);

if (!$token) {
  if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $name = isset($_POST['name']) ? trim((string)$_POST['name']) : '';
    $password = isset($_POST['password']) ? (string)$_POST['password'] : '';
    $resp = api_request($backend, 'POST', '/api/auth/login', null, ['name' => $name, 'password' => $password]);
    if ($resp['ok']) {
      $_SESSION['token'] = $resp['data']['token'] ?? '';
      $_SESSION['agent'] = $resp['data']['agent'] ?? [];
      redirect_to_self();
    }
    $flash_error = $resp['error'] ?? '登录失败';
  }

  ?>
  <!doctype html>
  <html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>代理后台 agent.php</title>
    <style>
      :root { color-scheme: light; }
      body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"; background: radial-gradient(1200px 600px at 20% 0%, rgba(22,119,255,0.22), transparent 60%), radial-gradient(1000px 520px at 90% 0%, rgba(114,46,209,0.18), transparent 55%), linear-gradient(180deg, #f7fbff 0%, #ffffff 50%, #f7fbff 100%); }
      .wrap { max-width: 420px; margin: 0 auto; padding: 64px 18px; }
      .card { background: rgba(255,255,255,0.75); backdrop-filter: blur(18px); border: 1px solid rgba(0,0,0,0.06); border-radius: 16px; box-shadow: 0 18px 44px rgba(22,119,255,0.14); padding: 18px; }
      h1 { margin: 0 0 6px; font-size: 22px; }
      .sub { color: rgba(0,0,0,0.55); font-size: 13px; margin-bottom: 14px; }
      label { display:block; font-size: 13px; color: rgba(0,0,0,0.72); margin: 10px 0 6px; }
      input { width: 100%; padding: 12px 12px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.12); background: rgba(255,255,255,0.9); outline: none; }
      input:focus { border-color: rgba(22,119,255,0.6); box-shadow: 0 0 0 4px rgba(22,119,255,0.12); }
      button { margin-top: 14px; width: 100%; padding: 12px 12px; border-radius: 12px; border: 0; background: linear-gradient(135deg, #1677ff 0%, #0958d9 100%); color: white; font-weight: 600; cursor: pointer; }
      .err { background: rgba(245, 34, 45, 0.08); border: 1px solid rgba(245, 34, 45, 0.22); color: rgba(0,0,0,0.72); padding: 10px 12px; border-radius: 12px; font-size: 13px; }
      .hint { margin-top: 12px; font-size: 12px; color: rgba(0,0,0,0.45); }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>代理后台</h1>
        <div class="sub">agent.php · 名称哈希 + 密码校验</div>
        <?php if ($flash_error): ?>
          <div class="err"><?php echo htmlspecialchars($flash_error, ENT_QUOTES, 'UTF-8'); ?></div>
        <?php endif; ?>
        <form method="post">
          <label>账号名</label>
          <input name="name" autocomplete="username" placeholder="例如：admin" required minlength="2" maxlength="80">
          <label>密码</label>
          <input type="password" name="password" autocomplete="current-password" placeholder="例如：123456" required minlength="6" maxlength="100">
          <button type="submit">登录</button>
        </form>
        <div class="hint">后端地址：<span class="mono"><?php echo htmlspecialchars($backend, ENT_QUOTES, 'UTF-8'); ?></span></div>
      </div>
    </div>
  </body>
  </html>
  <?php
  exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'generate') {
  $application_id = isset($_POST['application_id']) ? (int)$_POST['application_id'] : 0;
  $count = isset($_POST['count']) ? (int)$_POST['count'] : 0;
  $resp = api_request($backend, 'POST', '/api/card-keys/generate', $token, ['application_id' => $application_id, 'count' => $count]);
  if ($resp['ok']) {
    $_SESSION['flash_codes'] = $resp['data']['codes'] ?? [];
    $_SESSION['flash_app'] = (string)($resp['data']['application']['name'] ?? '');
  } else {
    $_SESSION['flash_error'] = $resp['error'] ?? '生成失败';
  }
  redirect_to_self();
}

$apps = api_request($backend, 'GET', '/api/apps', $token, null);
$hier = api_request($backend, 'GET', '/api/agents/hierarchy', $token, null);

if (!$apps['ok'] || !$hier['ok']) {
  $_SESSION = [];
  session_destroy();
  $flash_error = '登录已失效，请重新登录';
  redirect_to_self();
}

$appsData = $apps['data'] ?? [];
$chain = $hier['data']['chain'] ?? [];

?>
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>代理后台 agent.php</title>
  <style>
    :root { color-scheme: light; }
    body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; background: radial-gradient(1200px 700px at 10% 0%, rgba(22,119,255,0.14), transparent 60%), radial-gradient(1200px 700px at 90% 10%, rgba(114,46,209,0.12), transparent 55%), linear-gradient(180deg, #f7fbff 0%, #ffffff 50%, #f7fbff 100%); }
    .wrap { max-width: 980px; margin: 0 auto; padding: 28px 18px 60px; }
    .top { display:flex; align-items:center; justify-content:space-between; gap: 12px; margin-bottom: 14px; }
    .title { font-size: 20px; font-weight: 800; }
    .btn { padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.10); background: rgba(255,255,255,0.75); backdrop-filter: blur(14px); cursor:pointer; text-decoration:none; color: rgba(0,0,0,0.82); }
    .btn.primary { border:0; background: linear-gradient(135deg, #1677ff 0%, #0958d9 100%); color:white; font-weight:700; }
    .grid { display:grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
    .card { background: rgba(255,255,255,0.72); backdrop-filter: blur(16px); border: 1px solid rgba(0,0,0,0.06); border-radius: 16px; box-shadow: 0 12px 30px rgba(0,0,0,0.06); padding: 14px; }
    h2 { margin: 0 0 8px; font-size: 16px; }
    .sub { color: rgba(0,0,0,0.55); font-size: 12px; margin-bottom: 10px; }
    label { display:block; font-size: 13px; color: rgba(0,0,0,0.72); margin: 10px 0 6px; }
    select, input { width: 100%; padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.12); background: rgba(255,255,255,0.9); outline:none; }
    select:focus, input:focus { border-color: rgba(22,119,255,0.6); box-shadow: 0 0 0 4px rgba(22,119,255,0.12); }
    .row { display:flex; gap: 12px; }
    .row > div { flex: 1; }
    .err { background: rgba(245, 34, 45, 0.08); border: 1px solid rgba(245, 34, 45, 0.22); color: rgba(0,0,0,0.72); padding: 10px 12px; border-radius: 12px; font-size: 13px; margin-bottom: 12px; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
    ul { margin: 0; padding-left: 18px; }
    li { margin: 6px 0; color: rgba(0,0,0,0.78); }
    .codes { max-height: 320px; overflow:auto; background: rgba(0,0,0,0.03); border-radius: 12px; padding: 10px; border: 1px solid rgba(0,0,0,0.06); }
    .code { display:block; padding: 6px 8px; border-radius: 10px; background: rgba(255,255,255,0.85); border: 1px solid rgba(0,0,0,0.06); margin-bottom: 8px; }
    .foot { margin-top: 10px; color: rgba(0,0,0,0.45); font-size: 12px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div>
        <div class="title">代理后台</div>
        <div class="sub">agent.php · 生成绑定应用卡密 · 查看当前账号上级链路</div>
      </div>
      <div style="display:flex; gap: 10px; align-items:center;">
        <a class="btn" href="/"><?php echo '宣传页'; ?></a>
        <a class="btn" href="agent.php?action=logout">退出</a>
      </div>
    </div>

    <?php if ($flash_error): ?>
      <div class="err"><?php echo htmlspecialchars($flash_error, ENT_QUOTES, 'UTF-8'); ?></div>
    <?php endif; ?>

    <div class="grid">
      <div class="card">
        <h2>创建绑定应用的卡密</h2>
        <div class="sub">提交后将占用当前账号卡密额度（由 Node 后端校验）</div>
        <form method="post">
          <input type="hidden" name="action" value="generate">
          <label>应用</label>
          <select name="application_id" required>
            <option value="" disabled selected>请选择应用</option>
            <?php foreach ($appsData as $a): ?>
              <?php if (is_array($a) && isset($a['id'], $a['name'])): ?>
                <option value="<?php echo (int)$a['id']; ?>"><?php echo htmlspecialchars((string)$a['name'], ENT_QUOTES, 'UTF-8'); ?></option>
              <?php endif; ?>
            <?php endforeach; ?>
          </select>
          <div class="row">
            <div>
              <label>数量</label>
              <input type="number" name="count" value="10" min="1" max="500" required>
            </div>
            <div style="display:flex; align-items:flex-end;">
              <button class="btn primary" type="submit" style="width:100%;">生成</button>
            </div>
          </div>
        </form>

        <?php if (!empty($flash_codes)): ?>
          <div style="margin-top: 14px;">
            <div class="sub">已生成<?php echo $flash_app ? '（' . htmlspecialchars($flash_app, ENT_QUOTES, 'UTF-8') . '）' : ''; ?>：</div>
            <div class="codes">
              <?php foreach ($flash_codes as $c): ?>
                <?php if (is_string($c) && $c !== ''): ?>
                  <span class="mono code"><?php echo htmlspecialchars($c, ENT_QUOTES, 'UTF-8'); ?></span>
                <?php endif; ?>
              <?php endforeach; ?>
            </div>
          </div>
        <?php endif; ?>
      </div>

      <div class="card">
        <h2>查看当前账号的上级</h2>
        <div class="sub">展示从顶级上级到当前账号的链路</div>
        <ul>
          <?php foreach ($chain as $a): ?>
            <?php if (is_array($a) && isset($a['name'])): ?>
              <li>
                <span style="font-weight:700;"><?php echo htmlspecialchars((string)$a['name'], ENT_QUOTES, 'UTF-8'); ?></span>
                <span style="color: rgba(0,0,0,0.55); font-size: 12px;">（ID <?php echo (int)($a['id'] ?? 0); ?>）</span>
              </li>
            <?php endif; ?>
          <?php endforeach; ?>
        </ul>
        <div class="foot">后端地址：<span class="mono"><?php echo htmlspecialchars($backend, ENT_QUOTES, 'UTF-8'); ?></span></div>
      </div>
    </div>
  </div>
</body>
</html>
