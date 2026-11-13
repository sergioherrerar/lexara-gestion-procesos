<?php
// Portal de clientes — funciones comunes (2026-11-11). Todo el filtrado por cliente se hace AQUÍ, en el servidor:
// el navegador del cliente nunca recibe la clave de Microsoft ni procesos de otros clientes.

declare(strict_types=1);

/** El servidor no tiene config.php: el portal NO arranca (antes caía en silencio a la plantilla en modo demo, mostrando datos de ejemplo y el código en pantalla). */
class ConfigFaltante extends RuntimeException {}
function cfg(): array {
    static $c = null;
    if ($c === null) {
        $ruta = __DIR__ . '/config.php';
        if (!is_file($ruta)) {
            // La plantilla (modo demo) solo se usa para probar en un computador (localhost / línea de comandos), nunca en el servidor real.
            $local = PHP_SAPI === 'cli' || in_array((string)($_SERVER['SERVER_NAME'] ?? ''), ['localhost', '127.0.0.1', '::1'], true);
            if (!$local) throw new ConfigFaltante('Falta el archivo config.php en el servidor.');
            $ruta = __DIR__ . '/config.example.php';
        }
        $c = require $ruta;
    }
    return $c;
}
function esDemo(): bool {
    try { return (cfg()['modo'] ?? 'demo') !== 'real'; }
    catch (ConfigFaltante $e) { return false; }
}

function salir(array $datos, int $codigo = 200): void {
    http_response_code($codigo);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// ---------- archivos de datos (códigos, sesiones, límites, caché) ----------
function dirDatos(): string {
    $d = __DIR__ . '/data';
    if (!is_dir($d)) { @mkdir($d, 0700, true); }
    if (!is_file($d . '/.htaccess')) { @file_put_contents($d . '/.htaccess', "Require all denied\nDeny from all\n"); }
    return $d;
}
// Los archivos de datos se guardan como .php con un guardián al principio: aunque el servidor ignorara el .htaccess, abrirlos desde el navegador no muestra nada.
const GUARDIAN = "<?php http_response_code(404); exit; ?>
";
function leerJson(string $nombre): array {
    $f = dirDatos() . '/' . $nombre . '.php';
    if (!is_file($f)) return [];
    $t = @file_get_contents($f);
    if (!$t) return [];
    $j = json_decode(substr($t, strlen(GUARDIAN)), true);
    return is_array($j) ? $j : [];
}
function escribirJson(string $nombre, array $datos): void {
    $f = dirDatos() . '/' . $nombre . '.php';
    @file_put_contents($f, GUARDIAN . json_encode($datos, JSON_UNESCAPED_UNICODE), LOCK_EX);
}

// ---------- texto ----------
function normalizar(string $t): string {
    $t = mb_strtolower(trim($t), 'UTF-8');
    $t = strtr($t, ['á'=>'a','é'=>'e','í'=>'i','ó'=>'o','ú'=>'u','ü'=>'u','ñ'=>'n','à'=>'a','è'=>'e','ì'=>'i','ò'=>'o','ù'=>'u']);
    return trim(preg_replace('/\s+/', ' ', $t));
}
function sinHtml($t): string {
    $t = (string)$t;
    $t = preg_replace('#<(br|/p|/div|/li)\s*/?>#i', "\n", $t);
    $t = html_entity_decode(strip_tags($t), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    return trim(preg_replace("/[ \t]+/", ' ', preg_replace("/\n{3,}/", "\n\n", $t)));
}
function ipCliente(): string { return substr((string)($_SERVER['REMOTE_ADDR'] ?? '0'), 0, 64); }

// ---------- Microsoft Graph con la clave de la aplicación (solo modo real) ----------
function http(string $metodo, string $url, array $cabeceras, ?string $cuerpo = null, int $tiempo = 40): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $metodo, CURLOPT_HTTPHEADER => $cabeceras, CURLOPT_TIMEOUT => $tiempo]);
    if ($cuerpo !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $cuerpo);
    $r = curl_exec($ch);
    $codigo = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($r === false) throw new RuntimeException('Sin conexión con Microsoft: ' . $err);
    return [$codigo, $r];
}
function tokenGraph(): string {
    $c = cfg();
    $cache = leerJson('token.json');
    if (!empty($cache['token']) && ($cache['exp'] ?? 0) > time() + 120) return $cache['token'];
    [$codigo, $r] = http('POST', 'https://login.microsoftonline.com/' . $c['tenant_id'] . '/oauth2/v2.0/token',
        ['Content-Type: application/x-www-form-urlencoded'],
        http_build_query(['client_id' => $c['client_id'], 'client_secret' => $c['client_secret'], 'scope' => 'https://graph.microsoft.com/.default', 'grant_type' => 'client_credentials']));
    $j = json_decode($r, true);
    if ($codigo !== 200 || empty($j['access_token'])) throw new RuntimeException('Microsoft no entregó el token (' . $codigo . '): ' . substr((string)($j['error_description'] ?? $r), 0, 200));
    escribirJson('token.json', ['token' => $j['access_token'], 'exp' => time() + (int)($j['expires_in'] ?? 3000)]);
    return $j['access_token'];
}
function graphGet(string $rutaOUrl): array {
    $url = str_starts_with($rutaOUrl, 'http') ? $rutaOUrl : 'https://graph.microsoft.com/v1.0' . $rutaOUrl;
    for ($i = 0; $i < 3; $i++) {
        [$codigo, $r] = http('GET', $url, ['Authorization: Bearer ' . tokenGraph(), 'Accept: application/json']);
        if ($codigo === 429 || $codigo >= 500) { sleep(2 + $i); continue; }
        $j = json_decode($r, true);
        if ($codigo >= 400) throw new RuntimeException('Graph ' . $codigo . ': ' . substr((string)($j['error']['message'] ?? $r), 0, 200));
        return is_array($j) ? $j : [];
    }
    throw new RuntimeException('Microsoft está ocupado; intenta de nuevo en un momento.');
}
function graphTodos(string $ruta): array {
    $items = [];
    $url = $ruta;
    for ($pag = 0; $url && $pag < 60; $pag++) {
        $j = graphGet($url);
        foreach (($j['value'] ?? []) as $v) $items[] = $v;
        $url = $j['@odata.nextLink'] ?? null;
    }
    return $items;
}
function idSitio(string $rutaSitio): string {
    $c = cfg();
    $cache = leerJson('sitios.json');
    if (!empty($cache[$rutaSitio])) return $cache[$rutaSitio];
    $j = graphGet('/sites/' . $c['sp_host'] . ':' . $rutaSitio . '?$select=id');
    $cache[$rutaSitio] = $j['id'];
    escribirJson('sitios.json', $cache);
    return $j['id'];
}
function idLista(string $sitio, string $nombre): string {
    $cache = leerJson('listas.json');
    $clave = $sitio . '|' . $nombre;
    if (!empty($cache[$clave])) return $cache[$clave];
    foreach (graphTodos('/sites/' . $sitio . '/lists?$select=id,displayName&$top=200') as $l) {
        if (normalizar($l['displayName'] ?? '') === normalizar($nombre)) { $cache[$clave] = $l['id']; escribirJson('listas.json', $cache); return $l['id']; }
    }
    throw new RuntimeException('No encontré la lista «' . $nombre . '» en SharePoint.');
}
/** Nombre interno de la columna cuyo nombre visible coincide con alguna de las pistas (exacto primero, luego «contiene»). */
function columnasDe(string $sitio, string $lista): array {
    return graphTodos('/sites/' . $sitio . '/lists/' . $lista . '/columns?$select=name,displayName,lookup,personOrGroup&$top=500');
}
function resolverColumna(array $columnas, array $pistas): ?string {
    foreach ($pistas as $p) foreach ($columnas as $c) if (normalizar($c['displayName'] ?? '') === normalizar($p)) return $c['name'];
    foreach ($pistas as $p) foreach ($columnas as $c) if (str_contains(normalizar($c['displayName'] ?? ''), normalizar($p))) return $c['name'];
    return null;
}
/** Items de una lista con sus campos. Las columnas de tipo Búsqueda (p. ej. «Cliente» en Tutelas) y Persona vienen VACÍAS con $expand=fields a secas: Graph solo entrega su valor si se
 *  piden por nombre. Por eso se hace una segunda pasada SOLO con esas columnas y se une por id (igual que la app). */
function itemsDeLista(string $sitio, string $lista, array $cols): array {
    $items = graphTodos('/sites/' . $sitio . '/lists/' . $lista . '/items?$expand=fields&$top=200');
    $especiales = [];
    foreach ($cols as $c) if (!empty($c['lookup']) || !empty($c['personOrGroup'])) $especiales[] = $c['name'];
    if ($especiales) {
        $porId = [];
        foreach (graphTodos('/sites/' . $sitio . '/lists/' . $lista . '/items?$expand=fields($select=' . implode(',', $especiales) . ')&$top=200') as $it) $porId[$it['id']] = $it['fields'] ?? [];
        foreach ($items as $k => $it) if (isset($porId[$it['id']])) $items[$k]['fields'] = array_merge($it['fields'] ?? [], $porId[$it['id']]);
    }
    return $items;
}
function valorCampo($v): string {
    if (is_array($v)) {
        if (isset($v['LookupValue'])) return (string)$v['LookupValue'];
        if (isset($v[0]) && is_array($v[0]) && isset($v[0]['LookupValue'])) return implode('; ', array_map(fn($x) => (string)($x['LookupValue'] ?? ''), $v));
        return implode('; ', array_map('strval', array_filter($v, 'is_scalar')));
    }
    return (string)($v ?? '');
}

// ---------- accesos: quién entra y qué ve ----------
// Todo sale de la lista «Clientes» (la misma de siempre): cada cliente tiene su CORREO y su Entidad (p. ej. «GRUPO COLMEDICA»). Quien tenga su correo en la fila de un cliente
// entra y ve los procesos de TODA la Entidad de ese cliente; si la entidad tiene varios clientes (Grupo Colmédica) se ve un selector «Todos / cada cliente».
// Si hace falta dar acceso a más personas, se pueden agregar más correos (separados por «;») en la misma celda CORREO o en una columna opcional «Correos portal».
function claveEntidad(string $t): string { return normalizar(preg_replace('/\s+/', ' ', $t)); }

/** Filas de la lista Clientes: [['razon','correos','entidad']]. En modo real se lee de SharePoint y se guarda 5 minutos. */
function filasClientes(): array {
    if (esDemo()) {
        $demo = json_decode((string)file_get_contents(__DIR__ . '/demo-datos.json'), true);
        return $demo['clientes'];
    }
    $cache = leerJson('cache-clientes.json');
    if (!empty($cache['filas']) && ($cache['exp'] ?? 0) > time()) return $cache['filas'];
    $c = cfg();
    $sitio = idSitio($c['sitio_procesos']);
    $lista = idLista($sitio, ($c['lista_clientes'] ?? 'Clientes'));
    $cols = columnasDe($sitio, $lista);
    $cRazon = resolverColumna($cols, ['razon social']);
    $cCorreo = resolverColumna($cols, ['correo']);
    $cExtra = resolverColumna($cols, ['correos portal', 'correo portal']);
    $cEntidad = resolverColumna($cols, ['entidad']);
    if (!$cRazon || !$cCorreo || !$cEntidad) throw new RuntimeException('La lista Clientes necesita las columnas Razón social, Correo y Entidad.');
    $filas = [];
    foreach (itemsDeLista($sitio, $lista, $cols) as $it) {
        $f = $it['fields'] ?? [];
        $correos = valorCampo($f[$cCorreo] ?? '') . ';' . ($cExtra ? valorCampo($f[$cExtra] ?? '') : '');
        $filas[] = ['razon' => valorCampo($f[$cRazon] ?? ''), 'correos' => $correos, 'entidad' => valorCampo($f[$cEntidad] ?? '')];
    }
    escribirJson('cache-clientes.json', ['exp' => time() + 300, 'filas' => $filas]);
    return $filas;
}
/** ¿Es del equipo de Lexara? Por dominio de correo (config 'dominios_lexara') o por correo suelto (config 'correos_lexara'). */
function esEquipoLexara(string $correo): bool {
    $c = cfg();
    $correo = normalizar($correo);
    if (in_array($correo, array_map('normalizar', $c['correos_lexara'] ?? []), true)) return true;
    $dominio = substr(strrchr($correo, '@') ?: '', 1);
    return $dominio !== '' && in_array($dominio, array_map('normalizar', $c['dominios_lexara'] ?? ['lexaraabogados.com']), true);
}
function accesoDe(string $correo): ?array {
    $correo = normalizar($correo);
    if ($correo === '' || !filter_var($correo, FILTER_VALIDATE_EMAIL)) return null;
    if (esEquipoLexara($correo)) {
        // El equipo de Lexara entra con su correo y elige «ver como» cualquier cliente (ver opcionesEquipo / accesoDeOpcion). No es un cliente: no ve nada hasta elegir.
        return ['correo' => $correo, 'nombre' => 'Equipo Lexara', 'equipo' => true, 'entidades' => [], 'solos' => [], 'clientes' => [], 'grupo' => false];
    }
    return accesoDesdeClientes($correo, filasClientes());
}
/** Lo que el equipo puede elegir para «ver como»: cada entidad de GRUPO como una sola opción, y cada cliente suelto por separado. */
function opcionesEquipo(): array {
    $grupo = entidadesGrupo();
    $nombresGrupo = [];
    $opciones = [];
    // Solo clientes que YA tienen procesos en el Portal Lexara (2026-11-13, pedido del usuario): sin procesos no hay nada que ver «como él».
    $conProcesos = [];
    foreach (procesosTodos() as $pr) { $k = normalizar((string)($pr['Cliente'] ?? '')); if ($k !== '') $conProcesos[$k] = true; }
    foreach (filasClientes() as $fila) {
        $razon = trim((string)($fila['razon'] ?? ''));
        if ($razon === '' || !isset($conProcesos[normalizar($razon)])) continue;
        $ent = claveEntidad((string)($fila['entidad'] ?? ''));
        if ($ent !== '' && in_array($ent, $grupo, true)) { if (!isset($nombresGrupo[$ent])) $nombresGrupo[$ent] = trim((string)$fila['entidad']); }
        else $opciones['c:' . normalizar($razon)] = ['id' => 'c:' . normalizar($razon), 'nombre' => $razon, 'grupo' => false];
    }
    $etiquetas = array_change_key_case(cfg()['etiquetas_grupo'] ?? ['grupo colmedica' => 'Grupo Colmédica'], CASE_LOWER);
    $lista = [];
    foreach ($nombresGrupo as $ent => $nombre) $lista[] = ['id' => 'g:' . $ent, 'nombre' => $etiquetas[$ent] ?? $nombre, 'grupo' => true];
    $resto = array_values($opciones);
    usort($resto, fn($x, $y) => strcmp(normalizar($x['nombre']), normalizar($y['nombre'])));
    return array_merge($lista, $resto);
}
/** El acceso tal como lo tendría el cliente elegido (mismas reglas, mismos filtros): lo que ve el cliente es exactamente lo que ve el equipo. */
function accesoDeOpcion(string $id): ?array {
    $filas = filasClientes();
    if (strncmp($id, 'g:', 2) === 0) {
        $ent = substr($id, 2);
        if (!in_array($ent, entidadesGrupo(), true)) return null;
        $clientes = [];
        foreach ($filas as $fila) if (claveEntidad((string)($fila['entidad'] ?? '')) === $ent && trim((string)($fila['razon'] ?? '')) !== '') $clientes[] = trim((string)$fila['razon']);
        return $clientes ? ['correo' => '', 'nombre' => '', 'entidades' => [$ent], 'solos' => [], 'clientes' => array_values(array_unique($clientes)), 'grupo' => true] : null;
    }
    if (strncmp($id, 'c:', 2) === 0) {
        $n = substr($id, 2);
        foreach ($filas as $fila) {
            $razon = trim((string)($fila['razon'] ?? ''));
            if ($razon !== '' && normalizar($razon) === $n && !in_array(claveEntidad((string)($fila['entidad'] ?? '')), entidadesGrupo(), true)) {
                return ['correo' => '', 'nombre' => '', 'entidades' => [], 'solos' => [$n], 'clientes' => [$razon], 'grupo' => false];
            }
        }
    }
    return null;
}

/** Entidades que se ven como GRUPO (todos sus clientes juntos, con resumen y tutelas). Cualquier otra Entidad (particulares, empresas sueltas) = cada cliente ve solo lo suyo. */
function entidadesGrupo(): array {
    return array_map('claveEntidad', cfg()['entidades_grupo'] ?? ['GRUPO COLMEDICA']);
}
/** Puro (se prueba sin Microsoft). $filas = [['razon','correos','entidad']].
 *  - Si el correo está en un cliente de una entidad de GRUPO → ve toda la entidad (sus clientes y procesos), con resumen y tutelas.
 *  - Si no → ve solo ese cliente (por su razón social); las demás empresas de su misma «Entidad» NO se mezclan. */
function accesoDesdeClientes(string $correo, array $filas): ?array {
    $correo = normalizar($correo);
    $grupo = entidadesGrupo();
    $entidades = [];   // entidades de grupo a las que tiene acceso
    $solos = [];       // clientes individuales (razón social normalizada → nombre)
    foreach ($filas as $fila) {
        $razon = trim((string)($fila['razon'] ?? ''));
        if ($razon === '') continue;
        $correos = array_map('normalizar', preg_split('/[;,\s]+/', (string)($fila['correos'] ?? ''), -1, PREG_SPLIT_NO_EMPTY));
        if (!in_array($correo, $correos, true)) continue;
        $ent = claveEntidad((string)($fila['entidad'] ?? ''));
        if ($ent !== '' && in_array($ent, $grupo, true)) $entidades[$ent] = true;
        else $solos[normalizar($razon)] = $razon;
    }
    if (!$entidades && !$solos) return null;
    $clientes = array_values($solos);
    foreach ($filas as $fila) {
        $razon = trim((string)($fila['razon'] ?? ''));
        if ($razon !== '' && isset($entidades[claveEntidad((string)($fila['entidad'] ?? ''))])) $clientes[] = $razon;
    }
    return ['correo' => $correo, 'nombre' => '', 'entidades' => array_keys($entidades), 'solos' => array_keys($solos),
            'clientes' => array_values(array_unique($clientes)), 'grupo' => count($entidades) > 0];
}

// ---------- códigos de ingreso ----------
/**
 * Límite por ventana de tiempo. Con $anotar = true (por defecto) cuenta este intento; con false solo comprueba (para contar después, solo si de verdad se hizo).
 * Devuelve false si ya se llegó al máximo.
 */
function limitarIntentos(string $clave, int $maximo, int $ventanaSeg, bool $anotar = true): bool {
    $l = leerJson('limites.json');
    $ahora = time();
    foreach ($l as $k => $v) $l[$k] = array_values(array_filter($v, fn($t) => $t > $ahora - 86400));
    $recientes = array_filter($l[$clave] ?? [], fn($t) => $t > $ahora - $ventanaSeg);
    if (count($recientes) >= $maximo) { escribirJson('limites.json', $l); return false; }
    if ($anotar) $l[$clave][] = $ahora;
    escribirJson('limites.json', $l);
    return true;
}
/**
 * Códigos de ingreso vigentes de un correo: ['lista' => [['hash','exp'], …], 'intentos' => n]. Quita los vencidos; devuelve [] si no queda ninguno.
 * Acepta también el formato anterior (un solo código con 'hash' y 'exp').
 */
function codigosVigentes($r): array {
    if (!is_array($r) || !$r) return [];
    $lista = $r['lista'] ?? (isset($r['hash']) ? [['hash' => $r['hash'], 'exp' => $r['exp'] ?? 0]] : []);
    $lista = array_values(array_filter($lista, fn($i) => is_array($i) && isset($i['hash']) && ($i['exp'] ?? 0) >= time()));
    return $lista ? ['lista' => $lista, 'intentos' => (int)($r['intentos'] ?? 0)] : [];
}
/** Anota un intento ya realizado (ver limitarIntentos con $anotar = false). */
function anotarIntento(string $clave): void {
    $l = leerJson('limites.json');
    $ahora = time();
    foreach ($l as $k => $v) $l[$k] = array_values(array_filter($v, fn($t) => $t > $ahora - 86400));
    $l[$clave][] = $ahora;
    escribirJson('limites.json', $l);
}
/** Minutos que faltan para que se libere un cupo de este límite (mínimo 1). */
function minutosDeEspera(string $clave, int $maximo, int $ventanaSeg): int {
    $l = leerJson('limites.json');
    $ahora = time();
    $recientes = array_values(array_filter($l[$clave] ?? [], fn($t) => $t > $ahora - $ventanaSeg));
    if (count($recientes) < $maximo) return 1;
    sort($recientes);
    $liberaEn = $recientes[count($recientes) - $maximo] + $ventanaSeg - $ahora;
    return max(1, (int)ceil($liberaEn / 60));
}
function claveHash(string $s): string {
    $sal = leerJson('sal.json');
    if (empty($sal['s'])) { $sal = ['s' => bin2hex(random_bytes(32))]; escribirJson('sal.json', $sal); }
    return hash_hmac('sha256', $s, $sal['s']);
}
/**
 * Manda el código por correo. Config «envio» (opcional): 'auto' (por defecto: primero Microsoft 365 y, si no responde, el correo del propio servidor),
 * 'microsoft' (solo Microsoft) o 'servidor' (solo el correo del servidor de cPanel, sin Microsoft). Devuelve por cuál salió.
 */
/** Minutos que vale un código: lo del config, pero nunca menos de 20 (si el correo tarda en llegar, el código no puede vencer antes de que se lea). */
function vigenciaCodigoMinutos(): int {
    return max(20, (int)(cfg()['codigo_minutos'] ?? 20));
}
function enviarCodigo(string $correo, string $nombre, string $codigo): string {
    $inicio = microtime(true);
    $GLOBALS['envio_info'] = ['via' => '', 'fallo' => '', 'seg' => 0.0];
    $c = cfg();
    $modo = (string)($c['envio'] ?? 'auto');
    $minutos = vigenciaCodigoMinutos();
    $asunto = 'Su código de acceso — MD Abogados';
    $html = '<div style="font-family:Segoe UI,Arial,sans-serif;color:#1c2624;max-width:480px">'
        . '<p style="font-size:15px">' . ($nombre !== '' ? htmlspecialchars($nombre) . ', s' : 'S') . 'u código de acceso al portal de clientes de MD Abogados es:</p>'
        . '<p style="font-size:30px;font-weight:700;letter-spacing:6px;color:#004941;margin:14px 0">' . $codigo . '</p>'
        . '<p style="font-size:13px;color:#5c6b68">Vale ' . $minutos . ' minutos. Si usted no lo pidió, ignore este mensaje.</p></div>';
    $falloMicrosoft = '';
    if ($modo !== 'servidor') {
        try { enviarPorMicrosoft($correo, $asunto, $html); $GLOBALS['envio_info'] = ['via' => 'microsoft', 'fallo' => '', 'seg' => round(microtime(true) - $inicio, 1)]; return 'microsoft'; }
        catch (Throwable $e) {
            $falloMicrosoft = $e->getMessage();
            registrarError('Envío por Microsoft a ' . $correo . ' — ' . $falloMicrosoft);
            if ($modo === 'microsoft') throw $e;
        }
    }
    if (!enviarPorServidor($correo, $asunto, $html, (string)($c['correo_envio'] ?? ''))) {
        throw new RuntimeException('No se pudo enviar el correo' . ($falloMicrosoft !== '' ? ' (Microsoft: ' . $falloMicrosoft . ')' : '') . ' ni con el correo del servidor.');
    }
    $GLOBALS['envio_info'] = ['via' => 'servidor', 'fallo' => $falloMicrosoft, 'seg' => round(microtime(true) - $inicio, 1)];
    return 'servidor';
}
function enviarPorMicrosoft(string $correo, string $asunto, string $html): void {
    $c = cfg();
    $cuerpo = json_encode(['message' => [
        'subject' => $asunto,
        'body' => ['contentType' => 'HTML', 'content' => $html],
        'toRecipients' => [['emailAddress' => ['address' => $correo]]],
    ], 'saveToSentItems' => false], JSON_UNESCAPED_UNICODE);
    // Si Microsoft no contesta en 10 s no se espera más (normalmente tarda 1 o 2 s): se pasa al correo del servidor sin hacer esperar al cliente.
    [$codigoHttp, $r] = http('POST', 'https://graph.microsoft.com/v1.0/users/' . rawurlencode($c['correo_envio']) . '/sendMail',
        ['Authorization: Bearer ' . tokenGraph(), 'Content-Type: application/json'], $cuerpo, 10);
    if ($codigoHttp >= 300) {
        $j = json_decode((string)$r, true);
        $motivo = trim((string)($j['error']['code'] ?? '') . ' ' . (string)($j['error']['message'] ?? ''));
        throw new RuntimeException('Microsoft no aceptó el envío del correo (HTTP ' . $codigoHttp . ($motivo !== '' ? ': ' . substr($motivo, 0, 200) : '') . ').');
    }
}
/** Correo saliente del propio servidor (cPanel), sin Microsoft ni claves. Sale «de» el correo de envío del portal. */
function enviarPorServidor(string $correo, string $asunto, string $html, string $desde): bool {
    if (!filter_var($correo, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $correo)) return false;
    if (!filter_var($desde, FILTER_VALIDATE_EMAIL)) $desde = 'portal@' . preg_replace('/^www\./', '', (string)($_SERVER['HTTP_HOST'] ?? 'localhost'));
    // Mensaje «de verdad»: texto plano + HTML (los filtros de spam desconfían de los correos solo-HTML), cuerpo en base64 UTF-8 y Message-ID propio.
    $texto = trim(html_entity_decode(strip_tags(preg_replace('#</(p|div)>#i', "\n", $html)), ENT_QUOTES, 'UTF-8'));
    $dominio = substr(strrchr($desde, '@'), 1);
    $limite = 'portal_' . bin2hex(random_bytes(8));
    $cabeceras = "MIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary=\"" . $limite . "\"\r\nFrom: MD Abogados <" . $desde . ">\r\nReply-To: " . $desde
        . "\r\nMessage-ID: <" . bin2hex(random_bytes(12)) . '@' . $dominio . ">\r\nX-Auto-Response-Suppress: All\r\nX-Mailer: portal-clientes";
    $cuerpo = '--' . $limite . "\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($texto))
        . '--' . $limite . "\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($html))
        . '--' . $limite . "--\r\n";
    $asuntoCodificado = '=?UTF-8?B?' . base64_encode($asunto) . '?=';
    if (!function_exists('mail')) return false;
    $ok = @mail($correo, $asuntoCodificado, $cuerpo, $cabeceras, '-f' . $desde);
    if (!$ok) $ok = @mail($correo, $asuntoCodificado, $cuerpo, $cabeceras);   // algunos servidores no permiten indicar el remitente de sobre
    return (bool)$ok;
}
/** Deja el detalle técnico de un fallo en data/errores.log (carpeta protegida, nunca pública) para poder revisarlo sin mostrárselo al cliente. */
function registrarError(string $mensaje): void {
    @file_put_contents(dirDatos() . '/errores.log', '[' . date('Y-m-d H:i:s') . '] ' . $mensaje . "\n", FILE_APPEND | LOCK_EX);
}

// ---------- sesión ----------
function sesionActual(): ?array {
    $t = $_COOKIE['lexara_portal'] ?? '';
    if (!preg_match('/^[a-f0-9]{64}$/', $t)) return null;
    $s = leerJson('sesiones.json');
    $h = claveHash($t);
    $r = $s[$h] ?? null;
    if (!$r || $r['exp'] < time()) return null;
    // Se vuelve a leer el acceso: si lo desactivaron o le cambiaron los clientes, rige de inmediato.
    $acceso = accesoDe($r['correo']);
    return $acceso;
}
function abrirSesion(array $acceso): void {
    $horas = (int)(cfg()['sesion_horas'] ?? 8);
    $t = bin2hex(random_bytes(32));
    $s = leerJson('sesiones.json');
    foreach ($s as $k => $v) if ($v['exp'] < time()) unset($s[$k]);
    $s[claveHash($t)] = ['correo' => $acceso['correo'], 'exp' => time() + $horas * 3600];
    escribirJson('sesiones.json', $s);
    $https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    setcookie('lexara_portal', $t, ['expires' => time() + $horas * 3600, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Strict']);
}
function cerrarSesion(): void {
    $t = $_COOKIE['lexara_portal'] ?? '';
    if (preg_match('/^[a-f0-9]{64}$/', $t)) { $s = leerJson('sesiones.json'); unset($s[claveHash($t)]); escribirJson('sesiones.json', $s); }
    setcookie('lexara_portal', '', ['expires' => time() - 3600, 'path' => '/']);
}

// ---------- procesos (solo campos que el cliente puede ver) ----------
// [nombre interno real (el que confirmó la app en config.js) o null, pistas por nombre visible]. Lo que el cliente NO recibe: Observaciones, contingencia, honorarios y enlaces internos.
// Valores: SOLO los de reclamo de sus propios procesos (2026-11-13: son las columnas de valores de la carta/Excel del informe que se le entrega); nada del dinero del despacho (honorarios, contingencia).
const CAMPOS_PROCESO = [
    'Radicado'                  => [null, ['numero corto', 'numero_corto', 'radicado']],
    'Cliente'                   => [null, ['cliente']],
    'Entidad'                   => [null, ['entidad']],
    'Despacho'                  => [null, ['despacho judicial', 'despacho', 'juzgado']],
    'Demandante'                => [null, ['demandante']],
    'Demandado'                 => [null, ['demandado']],
    'ParteActuamos'             => [null, ['parte en la que actuamos', 'parte en que actuamos']],
    'TipoProceso'               => [null, ['tipo de proceso', 'tipoproceso']],
    'Instancia'                 => [null, ['instancia']],
    'EtapaProcesal'             => [null, ['etapa procesal', 'etapa']],
    'Estado'                    => [null, ['estado']],
    'FechaUltimoEstado'         => [null, ['fecha ultimo estado']],
    // Para «Ver más», los informes y la ficha:
    'NoCompleto'                => ['No_x0020_Completo', ['no completo', 'numero completo']],
    'NumeroDespacho'            => ['numero_x0020_de_x0020_despacho', ['numero de despacho']],
    'Apoderado'                 => ['Apoderada', ['apoderada', 'apoderado']],
    'TipoAccion'                => ['Tipo_x0020_de_x0020_Accion', ['tipo de accion']],
    'EstadoVT'                  => ['Estado_x0020_V_x002f_T', ['estado v/t', 'estado vt']],
    'FechaAdmision'             => ['Fecha_x0020_Admision_x0020_del_x', ['fecha admision', 'admision']],
    'FechaContestacion'         => ['Fecha_x0020_Contestacion_x0020_d', ['fecha contestacion', 'contestacion']],
    'FechaInstancia'            => ['fecha_x0020_Instancia', ['fecha instancia']],
    'FechaReformaDemanda'       => ['Fecha_x0020_reforma_x0020_de_x00', ['fecha reforma de demanda']],
    'FechaTerminacion'          => ['Fecha_x0020_Posible_x0020_Termin', ['fecha posible de terminacion', 'fecha terminacion']],
    'RadicacionProceso'         => ['Fecha_x0020_Radicacion_x0020_del', ['radicacion del proceso']],
    'Admitida'                  => ['Admitida', ['admitida']],
    'PruebaPericial'            => ['Prueba_x0020_Pericial', ['prueba pericial']],
    'OrigenTipoGlosa'           => ['Origen_x002f_Tipo_x0020_Glosa', ['origen tipo glosa', 'tipo glosa']],
    'HistoricoNumerosCompletos' => ['Historico_x0020_numeros_x0020_co', ['historico numeros completos']],
    'Historico'                 => ['Historico', ['historico']],
    // Valores de los reclamos del propio cliente (columnas «Valor radicación», «Valor Reforma», «Valor Cartera actual» y «Monto Medida Cautelar» del Excel de Informes). «Valor Cartera actual» es la MISMA columna que «Valor Actual Demanda».
    // Enlace a la carpeta del proceso PARA EL CLIENTE (la columna «Link cliente», la misma del «Enlace Proceso» de los Excel); no se entrega el link interno de la carpeta del despacho.
    'EnlaceProceso'             => ['LinkCliente', ['link cliente']],
    'ValorRadicacion'           => ['Valor_x0020_radicacion', ['valor radicacion']],
    'ValorReforma'              => ['Valor_x0020_Reforma', ['valor reforma']],
    'ValorActualDemanda'        => ['Valor_x0020_Actual_x0020_Demanda', ['valor actual demanda', 'valor cartera actual']],
    'ValorCarteraActual'        => ['Valor_x0020_Actual_x0020_Demanda', ['valor actual demanda', 'valor cartera actual']],
    'MontoMedidaCautelar'       => ['Monto_x0020_Medida_x0020_Cautela', ['monto medida cautelar']],
];
const CAMPOS_DINERO_PROCESO = ['ValorRadicacion', 'ValorReforma', 'ValorActualDemanda', 'ValorCarteraActual', 'MontoMedidaCautelar'];
const CAMPOS_FECHA_PROCESO = ['FechaUltimoEstado', 'FechaAdmision', 'FechaContestacion', 'FechaInstancia', 'FechaReformaDemanda', 'FechaTerminacion', 'RadicacionProceso'];
const CAMPOS_TEXTO_LARGO = ['Estado' => 3000, 'Historico' => 8000, 'HistoricoNumerosCompletos' => 1500];

function columnaDe(array $cols, ?string $interno, array $pistas): ?string {
    if ($interno) foreach ($cols as $c) if (($c['name'] ?? '') === $interno) return $interno;
    return resolverColumna($cols, $pistas);
}
function textoCampo($v): string {
    if ($v === true) return 'SI';
    if ($v === false) return 'NO';
    return valorCampo($v);
}
/** Desistimientos agrupados por el ID del proceso (la lista «Desistimientos tabla» se une por ID, no por contrato). */
function desistimientosPorProceso(): array {
    if (esDemo()) {
        $demo = json_decode((string)file_get_contents(__DIR__ . '/demo-datos.json'), true);
        $por = [];
        foreach (($demo['desistimientos'] ?? []) as $d) $por[(string)$d['Proceso']][] = ['FechaRadicacion' => $d['FechaRadicacion'] ?? '', 'Aprobacion' => $d['Aprobacion'] ?? '', 'FechaAprobacion' => $d['FechaAprobacion'] ?? '', 'Valor' => (float)($d['Valor'] ?? 0), 'Observaciones' => $d['Observaciones'] ?? ''];
        return $por;
    }
    $c = cfg();
    $sitio = idSitio($c['sitio_procesos']);
    $lista = idLista($sitio, $c['lista_desistimientos'] ?? 'Desistimientos tabla');
    $cols = columnasDe($sitio, $lista);
    $m = [
        'Proceso'         => columnaDe($cols, 'Proceso', ['proceso']),
        'FechaRadicacion' => columnaDe($cols, 'Fecha_x0020_Radicacion', ['fecha radicacion']),
        'Aprobacion'      => columnaDe($cols, 'Aprobacion', ['aprobacion']),
        'FechaAprobacion' => columnaDe($cols, 'Fecha_x0020_de_x0020_Aprobacion', ['fecha de aprobacion']),
        'Valor'           => columnaDe($cols, 'Desistimiento_x0020_Valor', ['desistimiento valor']),
        'Observaciones'   => columnaDe($cols, 'Observaciones', ['observaciones']),
    ];
    if (!$m['Proceso']) return [];
    $por = [];
    foreach (itemsDeLista($sitio, $lista, $cols) as $it) {
        $f = $it['fields'] ?? [];
        $id = trim(valorCampo($f[$m['Proceso']] ?? ''));
        if ($id === '') continue;
        $apr = $m['Aprobacion'] ? trim(valorCampo($f[$m['Aprobacion']] ?? '')) : '';
        $por[$id][] = [
            'FechaRadicacion' => $m['FechaRadicacion'] ? fechaIso($f[$m['FechaRadicacion']] ?? '') : '',
            'Aprobacion'      => $apr === '' ? '' : mb_convert_case(mb_strtolower($apr, 'UTF-8'), MB_CASE_TITLE, 'UTF-8'),   // «Aprobado» y «APROBADO» son lo mismo
            'FechaAprobacion' => $m['FechaAprobacion'] ? fechaIso($f[$m['FechaAprobacion']] ?? '') : '',
            'Valor'           => $m['Valor'] ? (float)($f[$m['Valor']] ?? 0) : 0.0,
            'Observaciones'   => $m['Observaciones'] ? mb_substr(sinHtml($f[$m['Observaciones']] ?? ''), 0, 600) : '',
        ];
    }
    return $por;
}
function procesosTodos(): array {
    if (esDemo()) {
        $demo = json_decode((string)file_get_contents(__DIR__ . '/demo-datos.json'), true);
        $des = desistimientosPorProceso();
        foreach ($demo['procesos'] as $k => $p) $demo['procesos'][$k]['Desistimientos'] = $des[(string)($p['id'] ?? '')] ?? [];
        return $demo['procesos'];
    }
    $cache = leerJson('cache-procesos.json');
    if (!empty($cache['procesos']) && ($cache['exp'] ?? 0) > time()) return $cache['procesos'];
    $c = cfg();
    $sitio = idSitio($c['sitio_procesos']);
    $lista = idLista($sitio, $c['lista_procesos']);
    $cols = columnasDe($sitio, $lista);
    $mapa = [];
    foreach (CAMPOS_PROCESO as $clave => [$interno, $pistas]) $mapa[$clave] = columnaDe($cols, $interno, $pistas);
    if (!$mapa['Cliente']) throw new RuntimeException('La lista de procesos no tiene la columna Cliente.');
    $des = desistimientosPorProceso();
    $salida = [];
    foreach (itemsDeLista($sitio, $lista, $cols) as $it) {
        $f = $it['fields'] ?? [];
        $p = ['id' => (string)$it['id']];
        foreach ($mapa as $clave => $interno) $p[$clave] = $interno ? textoCampo($f[$interno] ?? '') : '';
        // Los enlaces del sistema anterior venían envueltos en «#»: se limpian.
        $p['EnlaceProceso'] = trim((string)($p['EnlaceProceso'] ?? ''), "# \t\r\n");
        foreach (CAMPOS_DINERO_PROCESO as $clave) { $crudo = $mapa[$clave] ? ($f[$mapa[$clave]] ?? '') : ''; if (is_int($crudo) || is_float($crudo)) $p[$clave] = number_format((float)$crudo, 2, '.', ''); }
        foreach (CAMPOS_TEXTO_LARGO as $clave => $max) $p[$clave] = mb_substr(sinHtml($p[$clave]), 0, $max);
        foreach (CAMPOS_FECHA_PROCESO as $clave) if ($p[$clave] !== '') $p[$clave] = fechaIso($p[$clave]);
        $p['Desistimientos'] = $des[$p['id']] ?? [];
        $salida[] = $p;
    }
    escribirJson('cache-procesos.json', ['exp' => time() + 300, 'procesos' => $salida]);
    return $salida;
}
function clienteElegidoValido(array $acceso, ?string $clienteElegido): ?string {
    if ($clienteElegido === null || $clienteElegido === '' || $clienteElegido === 'todos') return '';
    $n = normalizar($clienteElegido);
    return in_array($n, array_map('normalizar', $acceso['clientes'] ?? []), true) ? $n : null;   // null = pidió un cliente que no es suyo
}
function procesosDe(array $acceso, ?string $clienteElegido): array {
    $elegido = clienteElegidoValido($acceso, $clienteElegido);
    if ($elegido === null) return [];
    $entidades = $acceso['entidades'] ?? [];
    $solos = $acceso['solos'] ?? [];
    $salida = [];
    foreach (procesosTodos() as $p) {
        $cli = normalizar((string)($p['Cliente'] ?? ''));
        $permitido = in_array(claveEntidad((string)($p['Entidad'] ?? '')), $entidades, true) || in_array($cli, $solos, true);
        if (!$permitido) continue;
        if ($elegido !== '' && $cli !== $elegido) continue;
        $salida[] = $p;
    }
    usort($salida, fn($a, $b) => strcmp($b['FechaUltimoEstado'] ?? '', $a['FechaUltimoEstado'] ?? ''));
    return $salida;
}

// ---------- tutelas y resumen (solo GRUPO COLMÉDICA) ----------
// Nombres internos reales de la lista Tutelas (mapeo confirmado en la app); si alguno no existe, se busca por nombre visible.
const CAMPOS_TUTELA = [
    'NoTutela'          => ['No_x0020_Tutela', ['no tutela', 'numero tutela']],
    'Cliente'           => ['Cliente', ['cliente']],
    'Entidad'           => ['Entidad', ['entidad']],
    'Juzgado'           => ['juzgado', ['juzgado']],
    'Departamento'      => ['Departamento', ['departamento']],
    'Ciudad'            => ['Ciudad', ['ciudad']],
    'FechaNotificacion' => ['fecha_x0020_Notificacion', ['fecha notificacion']],
    'FechaVencimiento'  => ['Vencimiento', ['vencimiento', 'fecha vencimiento']],
    'TipoRespuesta'     => ['Tipo_x0020_Respuesta', ['tipo respuesta']],
    'Usuario'           => ['Usuario', ['usuario']],
    'Prestacion'        => ['Prestacion', ['prestacion']],
    'NoIdentificacion'  => ['No_x0020_Identificacion', ['no identificacion']],
    'Tema'              => ['Tema', ['tema']],
    'Solicita'          => ['Solicita', ['solicita']],
    'AbogadoRespuesta'  => ['Abogado_x0020_Tutela', ['abogado tutela', 'abogado respuesta']],
    'Contestada'        => ['Contestada', ['contestada']],
    'FechaContestacion' => ['FechaContestacion', ['fecha contestacion']],
];
function fechaIso($v): string { return preg_match('/^(\d{4}-\d{2}-\d{2})/', (string)$v, $m) ? $m[1] : ''; }
function tutelasTodas(): array {
    if (esDemo()) {
        $demo = json_decode((string)file_get_contents(__DIR__ . '/demo-datos.json'), true);
        return $demo['tutelas'];
    }
    $cache = leerJson('cache-tutelas.json');
    if (!empty($cache['tutelas']) && ($cache['exp'] ?? 0) > time()) return $cache['tutelas'];
    $c = cfg();
    $sitio = idSitio($c['sitio_tutelas'] ?? '/sites/TutelasMDABOGADOS');
    $lista = idLista($sitio, $c['lista_tutelas'] ?? 'Tutelas');
    $cols = columnasDe($sitio, $lista);
    $nombres = array_column($cols, 'name');
    $mapa = [];
    foreach (CAMPOS_TUTELA as $clave => [$interno, $pistas]) $mapa[$clave] = in_array($interno, $nombres, true) ? $interno : resolverColumna($cols, $pistas);
    $salida = [];
    foreach (itemsDeLista($sitio, $lista, $cols) as $it) {
        $f = $it['fields'] ?? [];
        $x = ['id' => (string)$it['id']];
        foreach ($mapa as $clave => $interno) $x[$clave] = $interno ? valorCampo($f[$interno] ?? '') : '';
        $x['Solicita'] = mb_substr(sinHtml($x['Solicita']), 0, 3000);
        $x['FechaNotificacion'] = fechaIso($x['FechaNotificacion']);
        $x['FechaVencimiento'] = fechaIso($x['FechaVencimiento']);
        $x['FechaContestacion'] = fechaIso($x['FechaContestacion']);
        $x['Contestada'] = in_array(normalizar((string)$x['Contestada']), ['si', 'sí', 'true', '1', 'yes'], true);
        $salida[] = $x;
    }
    escribirJson('cache-tutelas.json', ['exp' => time() + 300, 'tutelas' => $salida]);
    return $salida;
}
function tutelasDe(array $acceso, ?string $clienteElegido): array {
    if (empty($acceso['grupo'])) return [];   // tutelas y resumen solo para el Grupo Colmédica
    $elegido = clienteElegidoValido($acceso, $clienteElegido);
    if ($elegido === null) return [];
    $permitidos = array_map('normalizar', $acceso['clientes'] ?? []);
    $salida = [];
    foreach (tutelasTodas() as $x) {
        $cli = normalizar((string)($x['Cliente'] ?? ''));
        if (!in_array($cli, $permitidos, true)) continue;
        if ($elegido !== '' && $cli !== $elegido) continue;
        $salida[] = $x;
    }
    usort($salida, fn($a, $b) => strcmp($b['FechaVencimiento'] ?? '', $a['FechaVencimiento'] ?? ''));
    return $salida;
}
function contar(array $filas, callable $clave): array {
    $c = [];
    foreach ($filas as $f) { $k = trim((string)$clave($f)); if ($k === '') $k = 'Sin dato'; $c[$k] = ($c[$k] ?? 0) + 1; }
    arsort($c);
    $salida = [];
    foreach ($c as $k => $n) $salida[] = ['nombre' => (string)$k, 'cantidad' => $n];
    return $salida;
}
/** Resumen estadístico del grupo: procesos y tutelas por cliente, por etapa, por mes y estado de envío. */
function resumenDe(array $acceso, ?string $clienteElegido): array {
    if (empty($acceso['grupo'])) return [];
    $procesos = procesosDe($acceso, $clienteElegido);
    $tutelas = tutelasDe($acceso, $clienteElegido);
    $enviadas = count(array_filter($tutelas, fn($x) => !empty($x['Contestada'])));
    $porMes = [];
    foreach ($tutelas as $x) { $m = substr((string)($x['FechaVencimiento'] ?? ''), 0, 7); if ($m !== '') $porMes[$m] = ($porMes[$m] ?? 0) + 1; }
    ksort($porMes);
    $porMes = array_slice($porMes, -12, null, true);
    $meses = [];
    foreach ($porMes as $m => $n) $meses[] = ['mes' => $m, 'cantidad' => $n];
    return [
        'procesos' => ['total' => count($procesos), 'porCliente' => contar($procesos, fn($p) => $p['Cliente'] ?? ''), 'porEtapa' => array_slice(contar($procesos, fn($p) => $p['EtapaProcesal'] ?? ''), 0, 8), 'porTipo' => array_slice(contar($procesos, fn($p) => $p['TipoProceso'] ?? ''), 0, 8)],
        'tutelas' => ['total' => count($tutelas), 'enviadas' => $enviadas, 'porEnviar' => count($tutelas) - $enviadas, 'porCliente' => contar($tutelas, fn($x) => $x['Cliente'] ?? ''), 'porTipo' => array_slice(contar($tutelas, fn($x) => $x['TipoRespuesta'] ?? ''), 0, 8), 'porEntidad' => array_slice(contar($tutelas, fn($x) => $x['Entidad'] ?? ''), 0, 8), 'porMes' => $meses],
    ];
}

/** Valor Entidad por Entidad + Cliente + Tipo, solo de los clientes de este grupo (el Excel de tutelas lo suma por cliente). Nunca se entrega el Valor Abogado. */
function valoresDe(array $acceso): array {
    if (empty($acceso['grupo'])) return [];
    $permitidos = array_map('normalizar', $acceso['clientes'] ?? []);
    if (esDemo()) {
        $demo = json_decode((string)file_get_contents(__DIR__ . '/demo-datos.json'), true);
        $filas = $demo['valores'] ?? [];
    } else {
        $cache = leerJson('cache-valores.json');
        if (!empty($cache['filas']) && ($cache['exp'] ?? 0) > time()) $filas = $cache['filas'];
        else {
            $c = cfg();
            $sitio = idSitio($c['sitio_tutelas'] ?? '/sites/TutelasMDABOGADOS');
            $lista = idLista($sitio, $c['lista_valores'] ?? 'Valores Entidad');
            $cols = columnasDe($sitio, $lista);
            $m = ['Entidad' => columnaDe($cols, 'Entidad', ['entidad']), 'Cliente' => columnaDe($cols, 'Clientess', ['clientess', 'cliente']),
                  'Tipo' => columnaDe($cols, 'Tipo', ['tipo']), 'ValorEntidad' => columnaDe($cols, 'Valor_x0020_Entidad', ['valor entidad'])];
            $filas = [];
            foreach (itemsDeLista($sitio, $lista, $cols) as $it) {
                $f = $it['fields'] ?? [];
                $filas[] = ['Entidad' => $m['Entidad'] ? valorCampo($f[$m['Entidad']] ?? '') : '', 'Cliente' => $m['Cliente'] ? valorCampo($f[$m['Cliente']] ?? '') : '',
                            'Tipo' => $m['Tipo'] ? valorCampo($f[$m['Tipo']] ?? '') : '', 'ValorEntidad' => $m['ValorEntidad'] ? (float)($f[$m['ValorEntidad']] ?? 0) : 0.0];
            }
            escribirJson('cache-valores.json', ['exp' => time() + 300, 'filas' => $filas]);
        }
    }
    return array_values(array_filter($filas, fn($v) => in_array(normalizar((string)($v['Cliente'] ?? '')), $permitidos, true)));
}
