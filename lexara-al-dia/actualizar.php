<?php
// Lexara al Día — ACTUALIZACIÓN SEMANAL de las últimas publicaciones (Instagram, YouTube y Spotify del podcast Café Laboral).
// Se ejecuta por el programador de tareas (cron) de cPanel, todos los días a las 6:00 a. m. (si no hay nada nuevo, no cambia nada); NO se puede abrir desde el navegador.
//
//   php actualizar.php                       → revisa todas las fuentes configuradas y actualiza data/publicaciones.json
//   php actualizar.php --solo=youtube,spotify → solo esas fuentes (instagram | youtube | spotify)
//   php actualizar.php --maximo=5            → cuántas publicaciones se muestran (por defecto, "maximo" de data/sitio.json; 5)
//   php actualizar.php --simular=prueba.json  → usa una respuesta guardada de Instagram (solo para probar)
//
// Reglas: se muestran las N publicaciones más recientes de TODAS las redes; cuando sale una nueva, la más antigua se retira (y se borra su miniatura).
// Si la misma pieza está en varias redes (p. ej. el mismo video en Instagram y en YouTube) se muestra una sola vez, con «También en …».
// Lo que usted editó a mano no se pisa. TikTok no tiene lectura automática pública: esas publicaciones se agregan con herramientas/agregar.cjs.
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$base = __DIR__;
$archivoJson = $base . '/data/publicaciones.json';
$archivoSitio = $base . '/data/sitio.json';
$carpetaMini = $base . '/assets/img/miniaturas';
$privado = $base . '/privado';
$archivoToken = $privado . '/token.php';
$archivoLog = $privado . '/actualizacion.log';
const GUARDIAN = "<?php http_response_code(404); exit; ?>\n";
const PREFIJO_MINI = 'assets/img/miniaturas/';

$opc = [];
foreach (array_slice($argv, 1) as $a) { if (preg_match('/^--([a-z]+)=(.*)$/', $a, $m)) $opc[$m[1]] = $m[2]; }

function registrar(string $mensaje): void {
    global $privado, $archivoLog;
    if (!is_dir($privado)) @mkdir($privado, 0700, true);
    $linea = '[' . date('Y-m-d H:i:s') . '] ' . $mensaje . "\n";
    @file_put_contents($archivoLog, $linea, FILE_APPEND | LOCK_EX);
    echo $linea;
}
function terminar(string $mensaje, int $codigo = 1): void { registrar(($codigo ? 'ERROR: ' : '') . $mensaje); exit($codigo); }

// ---------- red ----------
function http(string $url, array $o = []): array {
    $ch = curl_init($url);
    $cab = $o['cabeceras'] ?? [];
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_TIMEOUT => 40, CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; LexaraAlDia/1.0)', CURLOPT_HTTPHEADER => $cab]);
    if (isset($o['post'])) { curl_setopt($ch, CURLOPT_POST, true); curl_setopt($ch, CURLOPT_POSTFIELDS, $o['post']); }
    $r = curl_exec($ch); $codigo = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    if ($r === false) throw new RuntimeException('Sin conexión: ' . $err);
    return [$codigo, (string)$r];
}
function json_de(string $url, array $o = []): array {
    [$codigo, $r] = http($url, $o);
    $j = json_decode($r, true);
    if ($codigo !== 200 || !is_array($j)) throw new RuntimeException('Respondió ' . $codigo . ': ' . substr((string)($j['error']['message'] ?? $j['error_description'] ?? $r), 0, 160));
    return $j;
}

// ---------- configuración y claves ----------
function configuracion(): array { $f = __DIR__ . '/config.php'; return is_file($f) ? (require $f) : []; }
function leerSitio(): array { global $archivoSitio; return is_file($archivoSitio) ? (json_decode((string)file_get_contents($archivoSitio), true) ?: []) : []; }
function sinPlaceholder(string $v): string { return ($v === '' || str_contains($v, 'PEGA_AQUI')) ? '' : $v; }
function leerToken(): array {
    global $archivoToken;
    if (is_file($archivoToken)) {
        $j = json_decode(substr((string)file_get_contents($archivoToken), strlen(GUARDIAN)), true);
        if (is_array($j) && !empty($j['token'])) return $j;
    }
    return ['token' => sinPlaceholder((string)(configuracion()['instagram_token'] ?? '')), 'renovado' => ''];
}
function guardarToken(string $token): void {
    global $privado, $archivoToken;
    if (!is_dir($privado)) @mkdir($privado, 0700, true);
    @file_put_contents($archivoToken, GUARDIAN . json_encode(['token' => $token, 'renovado' => date('Y-m-d')]), LOCK_EX);
}
/** La clave de Instagram vale 60 días: se renueva sola si pasaron más de 30. */
function renovarTokenSiHaceFalta(array $t): string {
    $token = $t['token'];
    $dias = $t['renovado'] !== '' ? (int)((time() - strtotime($t['renovado'])) / 86400) : 999;
    if ($dias < 30) return $token;
    try {
        $j = json_de('https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=' . rawurlencode($token));
        if (!empty($j['access_token'])) { guardarToken($j['access_token']); registrar('Clave de Instagram renovada por 60 días más.'); return $j['access_token']; }
    } catch (Throwable $e) { registrar('Aviso: no se pudo renovar la clave de Instagram: ' . $e->getMessage()); }
    return $token;
}

// ---------- texto ----------
function normalizarTexto(string $s): string {
    if (class_exists('Normalizer')) { $n = \Normalizer::normalize($s, \Normalizer::FORM_KC); if ($n !== false) $s = $n; }   // «𝗶𝗻𝗰𝗶𝗱𝗲𝗻𝘁𝗲» → «incidente»
    return $s;
}
function recortar(string $s, int $max): string {
    $s = trim($s);
    if (mb_strlen($s) <= $max) return $s;
    $c = preg_replace('/\s+\S*$/u', '', mb_substr($s, 0, $max)) ?: mb_substr($s, 0, $max);
    return rtrim($c, " ,;:.-") . '…';
}
function sinEmojisFinales(string $s): string {
    $s = preg_replace('/[\s\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}\x{FE0F}\x{200D}]+$/u', '', $s) ?? $s;
    return trim(preg_replace('/^[\s\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}\x{FE0F}\x{200D}]+/u', '', $s) ?? $s);   // también los del principio
}
/** Título = primera línea; descripción = el resto sin hashtags ni «escríbenos»; etiquetas = primeros hashtags legibles. */
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
    $primera = $lineas ? $lineas[0] : 'Publicación';
    $resto = [];
    // Si la primera línea es un párrafo largo (sin encabezado), el título es su primera frase y el resto de la línea pasa a la descripción.
    if (mb_strlen($primera) > 90 && preg_match('/^(.{20,130}?[.!?])\s+(\S.*)$/us', $primera, $mm)) { $primera = $mm[1]; $resto[] = $mm[2]; }
    $titulo = sinEmojisFinales($primera);
    foreach (array_slice($lineas, 1) as $l) { if (preg_match('/^(\x{1F4E9}|\x{1F4F2}|\x{260E}|escr[ií]benos|cont[aá]ctanos|s[ií]guenos)/iu', $l)) continue; $resto[] = $l; }
    return ['titulo' => recortar($titulo, 110), 'descripcion' => recortar(implode(' ', $resto), 260), 'etiquetas' => $etiquetas];
}
function limpiarDescripcion(string $s): string {
    $s = normalizarTexto(html_entity_decode(strip_tags($s), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    $s = preg_replace('~https?://\S+~u', '', $s) ?? $s;
    $s = preg_replace('/#[\p{L}\p{N}_]+/u', '', $s) ?? $s;
    return recortar(preg_replace('/\s+/u', ' ', $s) ?? $s, 260);
}
/** Para saber si dos publicaciones de redes distintas son la misma pieza: título sin tildes, emojis ni signos. */
function claveTitulo(string $t): string {
    $t = normalizarTexto($t);
    if (class_exists('Normalizer')) { $d = \Normalizer::normalize($t, \Normalizer::FORM_D); if ($d !== false) $t = preg_replace('/\p{Mn}+/u', '', $d) ?? $t; }
    $t = mb_strtolower($t);
    $t = str_replace('global edit', '', $t);
    return trim(preg_replace('/[^\p{L}\p{N}]+/u', ' ', $t) ?? $t);
}
/** Identificador estable de una publicación a partir de su enlace (distintos formatos del mismo enlace dan la misma clave). */
function claveUrl(string $url): string {
    if (preg_match('~instagram\.com/(?:[\w.]+/)?(?:p|reel|reels|tv)/([\w-]+)~', $url, $m)) return 'ig:' . $m[1];
    if (preg_match('~(?:youtube\.com/(?:watch\?(?:[^#]*&)?v=|shorts/|embed/)|youtu\.be/)([\w-]{11})~', $url, $m)) return 'yt:' . $m[1];
    if (preg_match('~open\.spotify\.com/(?:intl-[a-z]+/)?(?:episode|show)/(\w+)~', $url, $m)) return 'sp:' . $m[1];
    if (preg_match('~tiktok\.com/.*/video/(\d+)~', $url, $m)) return 'tt:' . $m[1];
    return 'u:' . strtok($url, '?#');
}
function fechaBogota(string $iso): string {
    try { return (new DateTime($iso))->setTimezone(new DateTimeZone('America/Bogota'))->format('Y-m-d'); } catch (Throwable $e) { return date('Y-m-d'); }
}

// ---------- fuentes ----------
function desdeInstagram(int $limite, ?string $simular): array {
    if ($simular !== null) { $r = json_decode((string)file_get_contents($simular), true); registrar('MODO PRUEBA (Instagram): usando ' . $simular); }
    else {
        $t = leerToken();
        if ($t['token'] === '') { registrar('Instagram: sin clave, se omite (ver README para generarla).'); return []; }
        $token = renovarTokenSiHaceFalta($t);
        $r = json_de('https://graph.instagram.com/me/media?fields=id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp&limit=' . $limite . '&access_token=' . rawurlencode($token));
    }
    $salida = [];
    foreach ($r['data'] ?? [] as $it) {
        $permalink = (string)($it['permalink'] ?? ''); if ($permalink === '') continue;
        $texto = datosDeTexto((string)($it['caption'] ?? ''));
        $tipo = ($it['media_product_type'] ?? '') === 'REELS' ? 'reel' : (($it['media_type'] ?? '') === 'VIDEO' ? 'video' : 'publicacion');
        $salida[] = ['red' => 'instagram', 'tipo' => $tipo, 'titulo' => $texto['titulo'], 'descripcion' => $texto['descripcion'], 'etiquetas' => $texto['etiquetas'],
            'fecha' => fechaBogota((string)($it['timestamp'] ?? 'now')), 'url' => $permalink, 'imagen' => (string)($it['thumbnail_url'] ?? $it['media_url'] ?? ''), 'id' => (string)$it['id']];
    }
    return $salida;
}
/** El canal de YouTube publica un RSS abierto: no necesita clave. */
function desdeYoutube(string $canal): array {
    [$codigo, $xml] = http('https://www.youtube.com/feeds/videos.xml?channel_id=' . rawurlencode($canal));
    if ($codigo !== 200) throw new RuntimeException('YouTube respondió ' . $codigo);
    $doc = @simplexml_load_string($xml);
    if (!$doc) throw new RuntimeException('YouTube entregó un RSS ilegible.');
    $salida = [];
    foreach ($doc->entry as $e) {
        $yt = $e->children('yt', true); $media = $e->children('media', true);
        $id = (string)$yt->videoId; if ($id === '') continue;
        $enlace = (string)$e->link->attributes()['href'];
        $salida[] = ['red' => 'youtube', 'tipo' => str_contains($enlace, '/shorts/') ? 'reel' : 'video', 'titulo' => recortar(sinEmojisFinales(normalizarTexto((string)$e->title)), 110),
            'descripcion' => limpiarDescripcion((string)$media->group->description), 'etiquetas' => [], 'fecha' => fechaBogota((string)$e->published),
            'url' => $enlace ?: 'https://www.youtube.com/watch?v=' . $id, 'imagen' => 'https://i.ytimg.com/vi/' . $id . '/hqdefault.jpg', 'id' => $id];
    }
    return $salida;
}
/** Con clave de Spotify (gratis) trae los últimos episodios; sin clave, solo el más reciente (público). */
function desdeSpotify(string $show, string $limiteTxt, string $clienteId, string $secreto): array {
    $salida = [];
    if ($clienteId !== '' && $secreto !== '') {
        $tk = json_de('https://accounts.spotify.com/api/token', ['post' => 'grant_type=client_credentials', 'cabeceras' => ['Authorization: Basic ' . base64_encode($clienteId . ':' . $secreto), 'Content-Type: application/x-www-form-urlencoded']]);
        $r = json_de('https://api.spotify.com/v1/shows/' . rawurlencode($show) . '/episodes?market=CO&limit=' . (int)$limiteTxt, ['cabeceras' => ['Authorization: Bearer ' . $tk['access_token']]]);
        foreach ($r['items'] ?? [] as $ep) {
            $salida[] = ['red' => 'spotify', 'tipo' => 'podcast', 'titulo' => recortar(trim((string)$ep['name']), 110), 'descripcion' => limpiarDescripcion((string)($ep['description'] ?? '')), 'etiquetas' => [],
                'fecha' => (string)($ep['release_date'] ?? date('Y-m-d')), 'url' => (string)($ep['external_urls']['spotify'] ?? 'https://open.spotify.com/episode/' . $ep['id']),
                'imagen' => (string)($ep['images'][0]['url'] ?? ''), 'id' => (string)$ep['id']];
        }
        return $salida;
    }
    registrar('Spotify: sin clave, solo se lee el episodio más reciente (con clave se leen varios; ver README).');
    [$codigo, $html] = http('https://open.spotify.com/embed/show/' . rawurlencode($show));
    if ($codigo !== 200 || !preg_match('~<script id="__NEXT_DATA__"[^>]*>(.*?)</script>~s', $html, $m)) throw new RuntimeException('Spotify respondió ' . $codigo . ' (sin datos del programa).');
    $e = json_decode($m[1], true)['props']['pageProps']['state']['data']['entity'] ?? [];
    if (($e['type'] ?? '') !== 'episode' || empty($e['id'])) return [];
    $urlEp = 'https://open.spotify.com/episode/' . $e['id'];
    $imagen = '';
    try { $imagen = (string)(json_de('https://open.spotify.com/oembed?url=' . rawurlencode($urlEp))['thumbnail_url'] ?? ''); } catch (Throwable $x) { /* sin portada */ }
    $minutos = isset($e['duration']) ? (int)round($e['duration'] / 60000) : 0;
    $salida[] = ['red' => 'spotify', 'tipo' => 'podcast', 'titulo' => recortar(trim((string)$e['title']), 110), 'descripcion' => 'Episodio del podcast ' . ($e['subtitle'] ?? 'Café Laboral') . ($minutos ? ' · ' . $minutos . ' min' : '') . '.',
        'etiquetas' => [], 'fecha' => fechaBogota((string)($e['releaseDate']['isoString'] ?? 'now')), 'url' => $urlEp, 'imagen' => $imagen, 'id' => (string)$e['id']];
    return $salida;
}

// ---------- miniaturas ----------
function guardarMiniatura(string $urlImagen, string $nombre): string {
    global $carpetaMini;
    $destino = $carpetaMini . '/' . $nombre;
    if (is_file($destino) && filesize($destino) > 1024) return PREFIJO_MINI . $nombre;
    [$codigo, $bytes] = http($urlImagen);
    if ($codigo !== 200 || strlen($bytes) < 1024 || !@getimagesizefromstring($bytes)) throw new RuntimeException('No se pudo bajar la miniatura (' . $codigo . ').');
    if (!is_dir($carpetaMini)) @mkdir($carpetaMini, 0755, true);
    file_put_contents($destino, $bytes);
    return PREFIJO_MINI . $nombre;
}

// ================= 1) reunir candidatas =================
$sitio = leerSitio();
$maximo = max(1, min(30, (int)($opc['maximo'] ?? $sitio['maximo'] ?? 5)));
$fuentes = $sitio['fuentes'] ?? [];
$solo = isset($opc['solo']) ? array_filter(explode(',', $opc['solo'])) : ['instagram', 'youtube', 'spotify'];
$cfg = configuracion();
$candidatas = [];
$margen = $maximo + 3;   // se lee un poco más que el máximo por si alguna es repetida de otra red
$tareas = [
    'instagram' => fn() => desdeInstagram($margen, $opc['simular'] ?? null),
    'youtube'   => fn() => empty($fuentes['youtube']['canal']) ? [] : desdeYoutube((string)$fuentes['youtube']['canal']),
    'spotify'   => fn() => empty($fuentes['spotify']['show']) ? [] : desdeSpotify((string)$fuentes['spotify']['show'], (string)$margen, sinPlaceholder((string)($cfg['spotify_client_id'] ?? '')), sinPlaceholder((string)($cfg['spotify_client_secret'] ?? ''))),
];
foreach ($tareas as $nombre => $fn) {
    if (!in_array($nombre, $solo, true)) continue;
    try { $r = $fn(); $candidatas = array_merge($candidatas, $r); registrar(ucfirst($nombre) . ': ' . count($r) . ' publicación(es) leída(s).'); }
    catch (Throwable $e) { registrar('Aviso: ' . ucfirst($nombre) . ' no se pudo leer — ' . $e->getMessage()); }   // una fuente caída no frena a las demás
}
if (!$candidatas) terminar('No se pudo leer ninguna fuente. No se cambió nada.');

// ================= 2) unir con lo que ya hay (sin repetir la misma pieza en varias redes) =================
$lista = is_file($archivoJson) ? (json_decode((string)file_get_contents($archivoJson), true) ?: []) : [];
$porUrl = []; $porTitulo = [];
foreach ($lista as $i => $p) {
    $porUrl[claveUrl((string)($p['url'] ?? ''))] = $i;
    foreach ($p['tambien'] ?? [] as $t) $porUrl[claveUrl((string)($t['url'] ?? ''))] = $i;
    $kt = claveTitulo((string)($p['titulo'] ?? '')); if ($kt !== '') $porTitulo[$kt] = $i;
}
$prioridad = ['instagram' => 0, 'spotify' => 1, 'youtube' => 2];
usort($candidatas, fn($a, $b) => ($prioridad[$a['red']] ?? 9) <=> ($prioridad[$b['red']] ?? 9) ?: strcmp($b['fecha'], $a['fecha']));
$cambios = 0;   // solo cambios que de verdad llegan a la lista final
foreach ($candidatas as $c) {
    $k = claveUrl($c['url']);
    if (isset($porUrl[$k])) continue;                                         // ya está
    $kt = claveTitulo($c['titulo']);
    if ($kt !== '' && isset($porTitulo[$kt])) {                               // la misma pieza en otra red → «También en …»
        $i = $porTitulo[$kt];
        if (($lista[$i]['red'] ?? '') !== $c['red']) { $lista[$i]['tambien'][] = ['red' => $c['red'], 'url' => $c['url']]; $porUrl[$k] = $i; $cambios++; registrar('También en ' . $c['red'] . ': ' . $c['titulo']); }
        continue;
    }
    $lista[] = ['id' => $c['fecha'] . '-' . str_replace(':', '-', $k), 'tipo' => $c['tipo'], 'titulo' => $c['titulo'], 'descripcion' => $c['descripcion'], 'fecha' => $c['fecha'], 'red' => $c['red'],
        'url' => $c['url'], 'miniatura' => '', 'destacada' => false, 'etiquetas' => $c['etiquetas'], 'origen' => $c['red'], '_imagen' => $c['imagen'], '_nombre' => $c['red'] . '-' . preg_replace('/[^\w-]/', '', $c['id']) . '.jpg'];
    $i = count($lista) - 1; $porUrl[$k] = $i; if ($kt !== '') $porTitulo[$kt] = $i;
}

// ================= 3) quedarse con las N más recientes =================
usort($lista, fn($a, $b) => strcmp((string)($b['fecha'] ?? ''), (string)($a['fecha'] ?? '')));
$quedan = array_slice($lista, 0, $maximo);
$retiradas = array_slice($lista, $maximo);
foreach ($retiradas as $p) { if (empty($p['_nombre'])) { $cambios++; registrar('Retirada (la más antigua): ' . ($p['titulo'] ?? '')); } }
foreach ($quedan as $p) { if (!empty($p['_nombre'])) $cambios++; }
$usadas = [];
foreach ($quedan as $p) if (!empty($p['miniatura'])) $usadas[$p['miniatura']] = true;
foreach ($retiradas as $p) {
    $m = (string)($p['miniatura'] ?? '');
    if ($m !== '' && str_starts_with($m, PREFIJO_MINI) && !isset($usadas[$m]) && is_file($base . '/' . $m)) { @unlink($base . '/' . $m); registrar('Miniatura borrada: ' . basename($m)); }
}
$lista = $quedan; $fallas = 0;
foreach ($lista as &$p) {
    if (!empty($p['_imagen']) || !empty($p['_nombre'])) {
        if (!empty($p['_imagen'])) { try { $p['miniatura'] = guardarMiniatura($p['_imagen'], $p['_nombre']); } catch (Throwable $e) { registrar('Aviso: miniatura de «' . $p['titulo'] . '» — ' . $e->getMessage()); $fallas++; } }
        registrar('Nueva: [' . $p['tipo'] . ' · ' . $p['red'] . '] ' . $p['titulo'] . ' (' . $p['fecha'] . ')');
        unset($p['_imagen'], $p['_nombre']);
    }
}
unset($p);
if ($cambios === 0) { registrar('Sin cambios. Las ' . count($lista) . ' publicaciones más recientes ya están al día.'); exit(0); }

// la más reciente (video, reel o podcast) queda destacada, salvo que usted haya fijado una a mano con "destacadaFija": true
if (!array_filter($lista, fn($p) => !empty($p['destacadaFija']))) {
    $marcada = false;
    foreach ($lista as &$p) { $p['destacada'] = false; if (!$marcada && in_array($p['tipo'] ?? '', ['video', 'reel', 'podcast'], true)) { $p['destacada'] = true; $marcada = true; } }
    unset($p);
}

// ================= 4) guardar (con respaldo) =================
if (is_file($archivoJson)) @copy($archivoJson, $archivoJson . '.bak');
$tmp = $archivoJson . '.tmp';
if (file_put_contents($tmp, json_encode($lista, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . "\n") === false || !rename($tmp, $archivoJson)) terminar('No se pudo guardar data/publicaciones.json (revise los permisos).');
registrar('Listo: ' . count($lista) . ' publicaciones' . ($fallas ? ' (' . $fallas . ' sin miniatura)' : '') . '.');
exit(0);
