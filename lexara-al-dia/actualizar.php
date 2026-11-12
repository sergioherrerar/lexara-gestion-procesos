<?php
// Lexara al Día — ACTUALIZACIÓN SEMANAL desde Instagram (API oficial de Meta).
// Se ejecuta por el programador de tareas (cron) de cPanel, todos los lunes a las 6:00 a. m.; NO se puede abrir desde el navegador.
//
//   php actualizar.php                      → trae las últimas publicaciones de @lexaraabogados y actualiza data/publicaciones.json
//   php actualizar.php --limite=20          → cuántas publicaciones recientes revisar (por defecto 12)
//   php actualizar.php --simular=prueba.json → usa una respuesta guardada en vez de llamar a Instagram (solo para probar)
//
// Qué hace: agrega las publicaciones nuevas (con su miniatura guardada en assets/img/miniaturas/), respeta lo que ya está en la lista (si usted editó un título o
// agregó una publicación a mano, no se toca) y marca como destacada la más reciente. Renueva la clave de Instagram antes de que venza (dura 60 días).
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$base = __DIR__;
$archivoJson = $base . '/data/publicaciones.json';
$carpetaMini = $base . '/assets/img/miniaturas';
$privado = $base . '/privado';
$archivoToken = $privado . '/token.php';
$archivoLog = $privado . '/actualizacion.log';
const GUARDIAN = "<?php http_response_code(404); exit; ?>\n";

// ---------- opciones ----------
$opc = [];
foreach (array_slice($argv, 1) as $a) { if (preg_match('/^--([a-z]+)=(.*)$/', $a, $m)) $opc[$m[1]] = $m[2]; }
$limite = max(1, min(50, (int)($opc['limite'] ?? 12)));

function registrar(string $mensaje): void {
    global $privado, $archivoLog;
    if (!is_dir($privado)) @mkdir($privado, 0700, true);
    $linea = '[' . date('Y-m-d H:i:s') . '] ' . $mensaje . "\n";
    @file_put_contents($archivoLog, $linea, FILE_APPEND | LOCK_EX);
    echo $linea;
}
function terminar(string $mensaje, int $codigo = 1): void { registrar(($codigo ? 'ERROR: ' : '') . $mensaje); exit($codigo); }

// ---------- clave (token) de Instagram ----------
function configuracion(): array {
    $f = __DIR__ . '/config.php';
    return is_file($f) ? (require $f) : [];
}
function leerToken(): array {
    global $archivoToken;
    if (is_file($archivoToken)) {
        $t = @file_get_contents($archivoToken);
        $j = $t ? json_decode(substr($t, strlen(GUARDIAN)), true) : null;
        if (is_array($j) && !empty($j['token'])) return $j;
    }
    $c = configuracion();
    return ['token' => (string)($c['instagram_token'] ?? ''), 'renovado' => ''];
}
function guardarToken(string $token): void {
    global $privado, $archivoToken;
    if (!is_dir($privado)) @mkdir($privado, 0700, true);
    @file_put_contents($archivoToken, GUARDIAN . json_encode(['token' => $token, 'renovado' => date('Y-m-d')]), LOCK_EX);
}
function http(string $url): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_TIMEOUT => 40, CURLOPT_USERAGENT => 'LexaraAlDia/1.0']);
    $r = curl_exec($ch); $codigo = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    if ($r === false) throw new RuntimeException('Sin conexión: ' . $err);
    return [$codigo, (string)$r];
}
/** Renueva la clave si pasaron más de 30 días desde la última vez (la de Instagram vale 60 días; así nunca vence). */
function renovarTokenSiHaceFalta(array $t): string {
    $token = $t['token'];
    $dias = $t['renovado'] !== '' ? (int)((time() - strtotime($t['renovado'])) / 86400) : 999;
    if ($dias < 30) return $token;
    try {
        [$codigo, $r] = http('https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=' . rawurlencode($token));
        $j = json_decode($r, true);
        if ($codigo === 200 && !empty($j['access_token'])) { guardarToken($j['access_token']); registrar('Clave de Instagram renovada por 60 días más.'); return $j['access_token']; }
        registrar('Aviso: no se pudo renovar la clave (' . $codigo . '). Si falla pronto, genere una nueva en Meta.');
    } catch (Throwable $e) { registrar('Aviso: no se pudo renovar la clave: ' . $e->getMessage()); }
    return $token;
}

// ---------- texto de la publicación ----------
function normalizarTexto(string $s): string {
    if (class_exists('Normalizer')) { $n = \Normalizer::normalize($s, \Normalizer::FORM_KC); if ($n !== false) $s = $n; }   // convierte «𝗶𝗻𝗰𝗶𝗱𝗲𝗻𝘁𝗲» en «incidente»
    return $s;
}
function recortar(string $s, int $max): string {
    $s = trim($s);
    if (mb_strlen($s) <= $max) return $s;
    $c = mb_substr($s, 0, $max);
    $c = preg_replace('/\s+\S*$/u', '', $c) ?: $c;
    return rtrim($c, " ,;:.-") . '…';
}
/** Título = primera línea de la descripción; descripción = el resto sin hashtags ni llamados a escribir; etiquetas = primeros hashtags legibles. */
function datosDeTexto(string $caption): array {
    $caption = normalizarTexto(str_replace("\r", '', $caption));
    preg_match_all('/#([\p{L}\p{N}_]+)/u', $caption, $m);
    $etiquetas = [];
    foreach ($m[1] as $h) {
        if (in_array(mb_strtolower($h), ['lexaraabogados', 'colombia', 'abogados', 'derecho'], true)) continue;
        $legible = preg_replace('/(?<=\p{Ll})(?=\p{Lu})/u', ' ', str_replace('_', ' ', $h));
        $legible = mb_strtoupper(mb_substr($legible, 0, 1)) . mb_strtolower(mb_substr($legible, 1));
        if (!in_array($legible, $etiquetas, true)) $etiquetas[] = $legible;
        if (count($etiquetas) >= 3) break;
    }
    $sinHash = trim(preg_replace('/#[\p{L}\p{N}_]+/u', '', $caption));
    $lineas = array_values(array_filter(array_map('trim', explode("\n", $sinHash)), fn($l) => $l !== ''));
    $titulo = $lineas ? preg_replace('/[\s\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}\x{FE0F}]+$/u', '', $lineas[0]) : 'Publicación de Instagram';
    $resto = [];
    foreach (array_slice($lineas, 1) as $l) { if (preg_match('/^(\x{1F4E9}|\x{1F4F2}|\x{260E}|escr[ií]benos|cont[aá]ctanos|s[ií]guenos)/iu', $l)) continue; $resto[] = $l; }
    return ['titulo' => recortar($titulo, 110), 'descripcion' => recortar(implode(' ', $resto), 260), 'etiquetas' => $etiquetas];
}
function codigoCorto(string $url): string { return preg_match('~/(?:p|reel|reels|tv)/([\w-]+)~', $url, $m) ? $m[1] : $url; }

// ---------- miniatura ----------
function guardarMiniatura(string $urlImagen, string $nombre): string {
    global $carpetaMini;
    $destino = $carpetaMini . '/' . $nombre;
    if (is_file($destino) && filesize($destino) > 1024) return 'assets/img/miniaturas/' . $nombre;
    [$codigo, $bytes] = http($urlImagen);
    $info = $codigo === 200 ? @getimagesizefromstring($bytes) : false;
    if (!$info || strlen($bytes) < 1024) throw new RuntimeException('No se pudo bajar la miniatura (' . $codigo . ').');
    if (!is_dir($carpetaMini)) @mkdir($carpetaMini, 0755, true);
    file_put_contents($destino, $bytes);
    return 'assets/img/miniaturas/' . $nombre;
}

// ---------- 1) leer las publicaciones de Instagram ----------
if (isset($opc['simular'])) {
    $respuesta = json_decode((string)file_get_contents($opc['simular']), true);
    registrar('MODO PRUEBA: usando ' . $opc['simular']);
} else {
    $t = leerToken();
    if ($t['token'] === '' || str_contains($t['token'], 'PEGA_AQUI')) terminar('Falta la clave de Instagram (copie config.example.php como config.php y péguela ahí).');
    $token = renovarTokenSiHaceFalta($t);
    try {
        [$codigo, $r] = http('https://graph.instagram.com/me/media?fields=id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp&limit=' . $limite . '&access_token=' . rawurlencode($token));
    } catch (Throwable $e) { terminar($e->getMessage()); }
    $respuesta = json_decode($r, true);
    if ($codigo !== 200 || !isset($respuesta['data'])) terminar('Instagram respondió ' . $codigo . ': ' . substr((string)($respuesta['error']['message'] ?? $r), 0, 200) . ' (si dice que la clave venció, genere una nueva en Meta).');
}

// ---------- 2) unir con lo que ya hay ----------
$lista = is_file($archivoJson) ? (json_decode((string)file_get_contents($archivoJson), true) ?: []) : [];
$existentes = [];
foreach ($lista as $p) $existentes[codigoCorto((string)($p['url'] ?? ''))] = true;
$nuevas = 0; $fallas = 0;
foreach (array_reverse($respuesta['data'] ?? []) as $it) {
    $permalink = (string)($it['permalink'] ?? '');
    if ($permalink === '' || isset($existentes[codigoCorto($permalink)])) continue;
    $tipoMedio = (string)($it['media_type'] ?? '');
    $producto = (string)($it['media_product_type'] ?? '');
    $tipo = $producto === 'REELS' ? 'reel' : ($tipoMedio === 'VIDEO' ? 'video' : 'publicacion');
    $imagen = (string)($it['thumbnail_url'] ?? $it['media_url'] ?? '');
    $miniatura = '';
    if ($imagen !== '') { try { $miniatura = guardarMiniatura($imagen, 'ig-' . preg_replace('/[^\w-]/', '', (string)$it['id']) . '.jpg'); } catch (Throwable $e) { registrar('Aviso: ' . $permalink . ' — ' . $e->getMessage()); $fallas++; } }
    $texto = datosDeTexto((string)($it['caption'] ?? ''));
    $fecha = (new DateTime((string)($it['timestamp'] ?? 'now')))->setTimezone(new DateTimeZone('America/Bogota'))->format('Y-m-d');
    array_unshift($lista, [
        'id' => $fecha . '-ig-' . codigoCorto($permalink), 'tipo' => $tipo, 'titulo' => $texto['titulo'], 'descripcion' => $texto['descripcion'], 'fecha' => $fecha,
        'red' => 'instagram', 'url' => $permalink, 'miniatura' => $miniatura, 'destacada' => false, 'etiquetas' => $texto['etiquetas'], 'origen' => 'instagram',
    ]);
    $existentes[codigoCorto($permalink)] = true; $nuevas++;
    registrar('Nueva: [' . $tipo . '] ' . $texto['titulo'] . ' (' . $fecha . ')');
}
if ($nuevas === 0) { registrar('Sin publicaciones nuevas. Todo al día.'); exit(0); }

// la más reciente (video o reel) queda destacada, salvo que usted haya fijado una a mano con "destacadaFija": true
usort($lista, fn($a, $b) => strcmp((string)($b['fecha'] ?? ''), (string)($a['fecha'] ?? '')));
$hayFija = (bool)array_filter($lista, fn($p) => !empty($p['destacadaFija']));
if (!$hayFija) {
    $marcada = false;
    foreach ($lista as &$p) { $p['destacada'] = false; if (!$marcada && in_array($p['tipo'] ?? '', ['video', 'reel'], true)) { $p['destacada'] = true; $marcada = true; } }
    unset($p);
}

// ---------- 3) guardar (con respaldo) ----------
if (is_file($archivoJson)) @copy($archivoJson, $archivoJson . '.bak');
$tmp = $archivoJson . '.tmp';
if (file_put_contents($tmp, json_encode($lista, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . "\n") === false || !rename($tmp, $archivoJson)) terminar('No se pudo guardar data/publicaciones.json (revise los permisos).');
registrar('Listo: ' . $nuevas . ' publicación(es) nueva(s)' . ($fallas ? ', ' . $fallas . ' sin miniatura' : '') . '. Total: ' . count($lista) . '.');
exit(0);
