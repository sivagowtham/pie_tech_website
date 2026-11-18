<?php
/*
 * PIE Tech content admin API for ordinary PHP hosting (DirectAdmin / cPanel / any Apache or LiteSpeed host).
 * Same behaviour as the Cloudflare version in /functions: login, save documents, upload photos, editor accounts.
 * Needs PHP 7.4+ with the GD-free default extensions (json, openssl/random_bytes). No database.
 *
 * Routes (see .htaccess):  /api/data/<name>   public read
 *                          /api/admin/<path>  login, logout, me, save, upload, audit, users
 */
declare(strict_types=1);

const DOCS = ['news', 'gallery', 'clubs', 'research'];
const MAX_JSON = 600 * 1024;
const MAX_IMG = 2621440; // 2.5 MB
const SESSION_TTL = 8 * 3600;

$docroot = rtrim(str_replace('\\', '/', (string)($_SERVER['DOCUMENT_ROOT'] ?? dirname(__DIR__))), '/');
// Private folder (config, accounts, saved content). Looked for, in order: PIE_PRIVATE_DIR, ~/pietech_private (your
// home folder, outside every website folder - recommended), then next to the site's public_html.
$privateDir = null;
$home = function_exists('posix_getpwuid') && function_exists('posix_geteuid') ? (posix_getpwuid(posix_geteuid())['dir'] ?? '') : (getenv('HOME') ?: '');
foreach (array_filter([getenv('PIE_PRIVATE_DIR') ?: '', $home ? $home . '/pietech_private' : '', dirname($docroot) . '/pietech_private']) as $cand) {
    if (is_file($cand . '/config.php')) { $privateDir = $cand; break; }
}
if ($privateDir === null) $privateDir = ($home ? $home : dirname($docroot)) . '/pietech_private';
$cfgFile = $privateDir . '/config.php';
$CFG = is_file($cfgFile) ? (require $cfgFile) : [];

function out($data, int $status = 200, array $headers = []): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    foreach ($headers as $k => $v) header($k . ': ' . $v);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/* ---------- small helpers ---------- */
function b64u(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function unb64u(string $s): string { return (string)base64_decode(strtr($s, '-_', '+/')); }
function read_json_file(string $f) { return is_file($f) ? json_decode((string)file_get_contents($f), true) : null; }
function write_json_file(string $f, $data): void {
    $tmp = $f . '.' . bin2hex(random_bytes(4)) . '.tmp';
    file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT), LOCK_EX);
    rename($tmp, $f);
}
function with_lock(string $f, callable $fn) {
    $h = fopen($f . '.lock', 'c');
    flock($h, LOCK_EX);
    try { return $fn(); } finally { flock($h, LOCK_UN); fclose($h); }
}

/* ---------- sessions (signed cookie, same scheme as the Cloudflare version) ---------- */
function make_cookie(array $user): string {
    global $CFG;
    $payload = b64u(json_encode(['u' => $user['name'], 'r' => $user['role'], 'exp' => time() + SESSION_TTL]));
    $sig = b64u(hash_hmac('sha256', $payload, $CFG['SESSION_KEY'], true));
    return "pt_session={$payload}.{$sig}";
}
function set_cookie_header(string $value, int $maxAge): void {
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    header('Set-Cookie: ' . $value . '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' . $maxAge . ($secure ? '; Secure' : ''), false);
}
function current_user(): ?array {
    global $CFG;
    $c = $_COOKIE['pt_session'] ?? '';
    if (!$c || strpos($c, '.') === false || empty($CFG['SESSION_KEY'])) return null;
    [$payload, $sig] = explode('.', $c, 2);
    if (!hash_equals(b64u(hash_hmac('sha256', $payload, $CFG['SESSION_KEY'], true)), $sig)) return null;
    $d = json_decode(unb64u($payload), true);
    if (!is_array($d) || ($d['exp'] ?? 0) < time()) return null;
    return ['name' => (string)$d['u'], 'role' => $d['r'] === 'admin' ? 'admin' : 'editor'];
}

/* ---------- storage ---------- */
function store(): string {
    global $privateDir;
    foreach ([$privateDir, $privateDir . '/data', $privateDir . '/rl'] as $d) if (!is_dir($d)) @mkdir($d, 0750, true);
    return $privateDir;
}
function audit(string $who, string $action, string $doc = ''): void {
    $line = json_encode(['t' => (int)(microtime(true) * 1000), 'who' => $who, 'action' => $action, 'doc' => $doc], JSON_UNESCAPED_UNICODE) . "\n";
    @file_put_contents(store() . '/audit.log', $line, FILE_APPEND | LOCK_EX);
}

/* ---------- validation (port of functions/_lib/schema.js) ---------- */
class Bad extends Exception {}
function s($v, int $max = 2000): string { return is_string($v) ? mb_substr(trim($v), 0, $max) : ''; }
function a($v, int $max): array { return is_array($v) ? array_slice(array_values($v), 0, $max) : []; }
function ok_img($u): bool {
    return is_string($u) && strlen($u) < 400 && (preg_match('#^/media/u/[\w\-./]+$#', $u) || preg_match('#^images/[\w\-./%+ ]+$#', $u) || preg_match('#^https://[^\s"\'<>]+$#', $u));
}
function ok_link($u): bool {
    return is_string($u) && strlen($u) < 300 && (preg_match('#^[\w\-]+\.html(\?[\w=&%\-]*)?$#', $u) || preg_match('#^https://[^\s"\'<>]+$#', $u));
}
function iso_date($v): string { return is_string($v) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) ? $v : ''; }
function sanitize(string $name, $d): array {
    if (!is_array($d)) throw new Bad('Invalid data');
    if ($name === 'news') {
        $news = [];
        foreach (a($d['news'] ?? [], 1000) as $n) {
            $n = (array)$n; $title = s($n['title'] ?? '', 300);
            if ($title === '') throw new Bad('Every news item needs a title');
            $news[] = ['date' => iso_date($n['date'] ?? ''), 'title' => $title, 'summary' => s($n['summary'] ?? '', 3000), 'images' => array_values(array_filter(a($n['images'] ?? [], 12), 'ok_img'))];
        }
        return ['news' => $news];
    }
    if ($name === 'gallery') {
        $photos = [];
        foreach (a($d['photos'] ?? [], 3000) as $p) {
            $p = (array)$p;
            if (!ok_img($p['src'] ?? null)) throw new Bad('A photo has an invalid image path');
            $photos[] = ['src' => $p['src'], 'caption' => s($p['caption'] ?? '', 200), 'album' => s($p['album'] ?? '', 80) ?: 'General', 'date' => iso_date($p['date'] ?? '')];
        }
        return ['photos' => $photos];
    }
    if ($name === 'clubs') {
        $cats = array_values(array_filter(array_map(function ($c) { return s($c, 80); }, a($d['categories'] ?? [], 20))));
        $seen = []; $clubs = [];
        foreach (a($d['clubs'] ?? [], 200) as $c) {
            $c = (array)$c; $id = strtolower(s($c['id'] ?? '', 60));
            if (!preg_match('/^[a-z0-9-]{2,60}$/', $id)) throw new Bad('Club ids may contain only letters, numbers and hyphens');
            if (isset($seen[$id])) throw new Bad('Duplicate club id: ' . $id);
            $seen[$id] = 1;
            $o = ['id' => $id, 'name' => s($c['name'] ?? '', 120), 'category' => s($c['category'] ?? '', 80), 'summary' => s($c['summary'] ?? '', 300), 'description' => s($c['description'] ?? '', 4000),
                  'activities' => array_values(array_filter(array_map(function ($x) { return s($x, 200); }, a($c['activities'] ?? [], 30))))];
            if ($o['name'] === '') throw new Bad('Every club needs a name');
            if (!empty($c['page'])) { if (!ok_link($c['page'])) throw new Bad('Invalid page link for ' . $o['name']); $o['page'] = $c['page']; }
            if (!empty($c['coordinator'])) $o['coordinator'] = s($c['coordinator'], 200);
            $clubs[] = $o;
        }
        return ['categories' => $cats, 'clubs' => $clubs];
    }
    if ($name === 'research') {
        $members = [];
        foreach (a($d['members'] ?? [], 300) as $m) {
            $m = (array)$m; $o = ['name' => s($m['name'] ?? '', 150)];
            if ($o['name'] === '') throw new Bad('Every research member needs a name');
            foreach (['role', 'qualification', 'area'] as $k) if (!empty($m[$k])) $o[$k] = s($m[$k], 300);
            if (!empty($m['bio'])) $o['bio'] = s($m['bio'], 3000);
            $members[] = $o;
        }
        $areas = array_values(array_filter(array_map(function ($x) { return s($x, 120); }, a($d['areas'] ?? [], 60))));
        $sections = [];
        foreach (a($d['sections'] ?? [], 12) as $sec) {
            $sec = (array)$sec;
            $cols = array_map(function ($x) { return s($x, 80); }, a($sec['columns'] ?? [], 8));
            $items = [];
            foreach (a($sec['items'] ?? [], 1000) as $r) { $row = []; foreach ($cols as $i => $_) $row[] = s(is_array($r) ? ($r[$i] ?? '') : '', 500); $items[] = $row; }
            $sections[] = ['title' => s($sec['title'] ?? '', 120), 'columns' => $cols, 'items' => $items];
        }
        return ['members' => $members, 'areas' => $areas, 'sections' => $sections];
    }
    throw new Bad('Unknown document');
}

/* ---------- routing ---------- */
$route = trim((string)($_GET['route'] ?? ''), '/');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

/* public: current content, edited copy first, else the file shipped in /data */
if (preg_match('#^data/([a-z]+)$#', $route, $m)) {
    $name = $m[1];
    if (!in_array($name, DOCS, true) || $method !== 'GET') out(['error' => 'Not found'], 404);
    $doc = read_json_file(store() . "/data/doc-$name.json") ?: read_json_file($docroot . "/data/$name.json");
    if (!$doc) out(['error' => 'Not found'], 404);
    header('Cache-Control: public, max-age=30');
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($doc, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (strpos($route, 'admin/') !== 0) out(['error' => 'Not found'], 404);
$path = substr($route, 6);
if (empty($CFG['SESSION_KEY']) || strlen($CFG['SESSION_KEY']) < 24) out(['error' => 'Admin is not configured yet'], 503);

// same-site requests only for anything that changes data
if ($method !== 'GET' && !empty($_SERVER['HTTP_ORIGIN'])) {
    $host = ($_SERVER['HTTP_X_FORWARDED_HOST'] ?? $_SERVER['HTTP_HOST'] ?? '');
    if (parse_url($_SERVER['HTTP_ORIGIN'], PHP_URL_HOST) !== preg_replace('/:\d+$/', '', $host)) out(['error' => 'Forbidden'], 403);
}
$body = file_get_contents('php://input') ?: '';

if ($path === 'login' && $method === 'POST') {
    $ip = hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'x');
    $rl = store() . "/rl/$ip.json";
    $st = read_json_file($rl); $tries = ($st && ($st['until'] ?? 0) > time()) ? (int)$st['n'] : 0;
    if ($tries >= 10) out(['error' => 'Too many attempts. Please wait 15 minutes.'], 429);
    $b = json_decode($body, true);
    if (!is_array($b)) out(['error' => 'Bad request'], 400);
    $name = strtolower(trim(mb_substr((string)($b['user'] ?? ''), 0, 40)));
    $pw = mb_substr((string)($b['password'] ?? ''), 0, 200);
    $user = null;
    if ($name === 'admin') {
        if (!empty($CFG['ADMIN_PASSWORD']) && hash_equals((string)$CFG['ADMIN_PASSWORD'], $pw)) $user = ['name' => 'admin', 'role' => 'admin'];
    } elseif (preg_match('/^[a-z0-9._-]{3,32}$/', $name)) {
        $users = read_json_file(store() . '/users.json') ?: [];
        if (isset($users[$name]) && password_verify($pw, $users[$name]['hash'])) $user = ['name' => $name, 'role' => $users[$name]['role'] === 'admin' ? 'admin' : 'editor'];
    }
    if (!$user) {
        write_json_file($rl, ['n' => $tries + 1, 'until' => time() + 900]);
        out(['error' => 'Wrong username or password'], 401);
    }
    @unlink($rl);
    audit($user['name'], 'login');
    set_cookie_header(make_cookie($user), SESSION_TTL);
    out(['ok' => true, 'user' => $user]);
}
if ($path === 'logout' && $method === 'POST') { set_cookie_header('pt_session=', 0); out(['ok' => true]); }

$me = current_user();
if (!$me) out(['error' => 'Please sign in'], 401);
if ($path === 'me' && $method === 'GET') out(['user' => $me]);

/* save a document */
if ($path === 'save' && $method === 'PUT') {
    if (strlen($body) > MAX_JSON) out(['error' => 'Too much data'], 413);
    $b = json_decode($body, true);
    if (!is_array($b)) out(['error' => 'Bad request'], 400);
    $name = $b['name'] ?? '';
    if (!in_array($name, DOCS, true)) out(['error' => 'Unknown document'], 400);
    try { $clean = sanitize($name, $b['data'] ?? null); } catch (Bad $e) { out(['error' => $e->getMessage()], 400); }
    $file = store() . "/data/doc-$name.json";
    $res = with_lock($file, function () use ($file, $b, $clean, $me) {
        $cur = read_json_file($file);
        $curRev = $cur ? (int)($cur['_rev'] ?? 0) : 0;
        if ((int)($b['rev'] ?? 0) !== $curRev) return [409, ['error' => 'Someone else saved changes first. Reload the page and apply your change again.', 'rev' => $curRev]];
        $rev = (int)(microtime(true) * 1000);
        write_json_file($file, $clean + ['_rev' => $rev, '_by' => $me['name']]);
        return [200, ['ok' => true, 'rev' => $rev]];
    });
    if ($res[0] === 200) audit($me['name'], 'saved', $name);
    out($res[1], $res[0]);
}

/* photo upload (already resized in the browser) / delete */
if ($path === 'upload' && $method === 'POST') {
    $len = strlen($body);
    if ($len < 12 || $len > MAX_IMG) out(['error' => 'Photo must be under 2.5 MB'], 413);
    if (substr($body, 0, 3) === "\xFF\xD8\xFF") $ext = 'jpg';
    elseif (substr($body, 0, 4) === "\x89PNG") $ext = 'png';
    elseif (substr($body, 0, 4) === 'RIFF' && substr($body, 8, 4) === 'WEBP') $ext = 'webp';
    else out(['error' => 'Only JPEG, PNG or WebP photos are allowed'], 415);
    $dir = $docroot . '/media/u/' . gmdate('Ym');
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) out(['error' => 'The media folder is not writable on this server'], 500);
    $key = bin2hex(random_bytes(8)) . '.' . $ext;
    file_put_contents($dir . '/' . $key, $body);
    audit($me['name'], 'uploaded photo', gmdate('Ym') . '/' . $key);
    out(['ok' => true, 'src' => '/media/u/' . gmdate('Ym') . '/' . $key]);
}
if ($path === 'upload' && $method === 'DELETE') {
    $key = (string)($_GET['key'] ?? '');
    if (!preg_match('#^u/\d{6}/[0-9a-f]{16}\.(jpg|png|webp)$#', $key)) out(['error' => 'Bad key'], 400);
    @unlink($docroot . '/media/' . $key);
    audit($me['name'], 'deleted photo', $key);
    out(['ok' => true]);
}

if ($path === 'audit' && $method === 'GET') {
    $f = store() . '/audit.log';
    $lines = is_file($f) ? array_slice(file($f, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES), -60) : [];
    $rows = array_reverse(array_values(array_filter(array_map(function ($l) { return json_decode($l, true); }, $lines))));
    out(['rows' => $rows]);
}

/* editor accounts (admin only) */
if ($path === 'users') {
    if ($me['role'] !== 'admin') out(['error' => 'Admins only'], 403);
    $uf = store() . '/users.json';
    if ($method === 'GET') {
        $users = read_json_file($uf) ?: [];
        $rows = []; foreach ($users as $n => $u) $rows[] = ['name' => $n, 'role' => $u['role'], 'created' => $u['created'] ?? 0];
        out(['users' => $rows]);
    }
    if ($method === 'POST') {
        $b = json_decode($body, true);
        if (!is_array($b)) out(['error' => 'Bad request'], 400);
        $name = strtolower(trim((string)($b['name'] ?? '')));
        if (!preg_match('/^[a-z0-9._-]{3,32}$/', $name) || $name === 'admin') out(['error' => 'Username: 3-32 letters, numbers, dots or hyphens'], 400);
        if (mb_strlen((string)($b['password'] ?? '')) < 10) out(['error' => 'Password must be at least 10 characters'], 400);
        with_lock($uf, function () use ($uf, $name, $b, $me) {
            $users = read_json_file($uf) ?: [];
            $users[$name] = ['role' => ($b['role'] ?? '') === 'admin' ? 'admin' : 'editor', 'hash' => password_hash((string)$b['password'], PASSWORD_DEFAULT), 'created' => (int)(microtime(true) * 1000), 'by' => $me['name']];
            write_json_file($uf, $users);
        });
        audit($me['name'], 'saved account', $name);
        out(['ok' => true]);
    }
    if ($method === 'DELETE') {
        $name = strtolower((string)($_GET['name'] ?? ''));
        if (!preg_match('/^[a-z0-9._-]{3,32}$/', $name)) out(['error' => 'Bad name'], 400);
        with_lock($uf, function () use ($uf, $name) { $users = read_json_file($uf) ?: []; unset($users[$name]); write_json_file($uf, $users); });
        audit($me['name'], 'removed account', $name);
        out(['ok' => true]);
    }
}
out(['error' => 'Not found'], 404);
