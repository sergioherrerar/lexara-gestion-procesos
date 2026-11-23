<?php
// RESPALDO DIARIO DE TUTELAS POR CORREO (2026-11-20, pedido del usuario): una «foto» de las tutelas con sus vencimientos, enviada a Gmail, para no quedar a ciegas si Microsoft cae.
// Lee la lista «Tutelas» de SharePoint con la clave de la app «Lexara-Procesos» (solo LEE) y envía el resultado POR GMAIL (no por Microsoft), con una tabla en el cuerpo del correo y el detalle en un
// CSV adjunto que abre Excel. Se ejecuta por el programador de tareas (cron) de cPanel; NO se puede abrir desde el navegador.
//
//   php respaldo.php                      → lee SharePoint y envía el correo
//   php respaldo.php --solo-mostrar       → lee SharePoint y guarda privado/ultimo-respaldo.html y .csv, SIN enviar (para revisar)
//   php respaldo.php --probar-correo      → envía un correo corto de prueba (verifica el envío), sin tocar SharePoint
//   php respaldo.php --simular=ejemplo.json [--solo-mostrar]   → usa datos de un archivo en vez de SharePoint (pruebas)
//
// Reglas: «pendiente» = no contestada y con vencimiento hasta 10 días atrás o en el futuro. Lo que vence hoy, mañana y pasado va primero; lo vencido sin contestar (últimos 10 días) se marca en rojo.
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
date_default_timezone_set('America/Bogota');
mb_internal_encoding('UTF-8');

$base = __DIR__;
$privado = $base . '/privado';
$archivoLog = $privado . '/respaldo.log';
if (!is_dir($privado)) @mkdir($privado, 0700, true);

$opc = [];
foreach (array_slice($argv, 1) as $a) { if (preg_match('/^--([a-z-]+)(?:=(.*))?$/', $a, $m)) $opc[$m[1]] = $m[2] ?? '1'; }

function registrar(string $mensaje): void {
    global $archivoLog;
    $linea = '[' . date('Y-m-d H:i:s') . '] ' . $mensaje . "\n";
    @file_put_contents($archivoLog, $linea, FILE_APPEND | LOCK_EX);
    echo $linea;
}
function terminar(string $mensaje, int $codigo = 1): void { registrar(($codigo ? 'ERROR: ' : '') . $mensaje); exit($codigo); }
function cfg(): array {
    static $c = null;
    if ($c !== null) return $c;
    $f = __DIR__ . '/config.php';
    if (!is_file($f)) terminar('Falta config.php (copie config.example.php a config.php y complete las claves).');
    $c = require $f;
    return is_array($c) ? $c : [];
}
$normalizar = fn(string $t): string => trim(preg_replace('/\s+/', ' ', mb_strtolower(strtr($t, ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n', 'Á' => 'a', 'É' => 'e', 'Í' => 'i', 'Ó' => 'o', 'Ú' => 'u', 'Ñ' => 'n']))));

// ---------- Microsoft Graph (solo lectura) ----------
function http(string $metodo, string $url, array $cabeceras, ?string $cuerpo = null, int $tiempo = 60): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $metodo, CURLOPT_HTTPHEADER => $cabeceras, CURLOPT_TIMEOUT => $tiempo]);
    if ($cuerpo !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $cuerpo);
    $r = curl_exec($ch); $codigo = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    if ($r === false) throw new RuntimeException('Sin conexión con Microsoft: ' . $err);
    return [$codigo, (string)$r];
}
function tokenGraph(): string {
    static $token = null, $exp = 0;
    if ($token !== null && $exp > time() + 120) return $token;
    $c = cfg();
    $secreto = trim((string)($c['client_secret'] ?? ''), " \t\n\r\0\x0B\"'");   // quita espacios, saltos de línea y comillas que sobren al pegar
    [$codigo, $r] = http('POST', 'https://login.microsoftonline.com/' . $c['tenant_id'] . '/oauth2/v2.0/token', ['Content-Type: application/x-www-form-urlencoded'],
        http_build_query(['client_id' => $c['client_id'], 'client_secret' => $secreto, 'scope' => 'https://graph.microsoft.com/.default', 'grant_type' => 'client_credentials']));
    $j = json_decode($r, true);
    if ($codigo !== 200 || empty($j['access_token'])) {
        // Pista sin mostrar la clave: un secreto verdadero de Azure mide ~40 caracteres y no es un GUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx = el «Id. de secreto», que NO sirve).
        $esGuid = (bool)preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $secreto);
        $pista = ' [Clave en config.php: ' . strlen($secreto) . ' caracteres, empieza con «' . substr($secreto, 0, 3) . '» y termina en «' . substr($secreto, -2) . '», aplicación ' . substr((string)($c['client_id'] ?? ''), 0, 8) . '…' .($esGuid ? ', PARECE EL ID DEL SECRETO (con guiones), hay que poner el VALOR' : (str_contains($secreto, 'PEGA_AQUI') ? ', sigue el texto de ejemplo' : (strlen($secreto) < 30 ? ', MUY CORTA, quedó incompleta' : ''))) . '.]';
        throw new RuntimeException('Microsoft no entregó el token (' . $codigo . '): ' . substr((string)($j['error_description'] ?? $r), 0, 90) . $pista);
    }
    $token = $j['access_token']; $exp = time() + (int)($j['expires_in'] ?? 3000);
    return $token;
}
function graphGet(string $rutaOUrl): array {
    $url = str_starts_with($rutaOUrl, 'http') ? $rutaOUrl : 'https://graph.microsoft.com/v1.0' . $rutaOUrl;
    for ($i = 0; $i < 4; $i++) {
        [$codigo, $r] = http('GET', $url, ['Authorization: Bearer ' . tokenGraph(), 'Accept: application/json']);
        if ($codigo === 429 || $codigo >= 500) { sleep(2 + 2 * $i); continue; }
        $j = json_decode($r, true);
        if ($codigo >= 400) throw new RuntimeException('Graph ' . $codigo . ': ' . substr((string)($j['error']['message'] ?? $r), 0, 220));
        return is_array($j) ? $j : [];
    }
    throw new RuntimeException('Microsoft está ocupado o no responde; no se pudo leer la lista.');
}
function graphTodos(string $ruta, int $maxPaginas = 120): array {
    $items = []; $url = $ruta;
    for ($pag = 0; $url && $pag < $maxPaginas; $pag++) { $j = graphGet($url); foreach (($j['value'] ?? []) as $v) $items[] = $v; $url = $j['@odata.nextLink'] ?? null; }
    return $items;
}
function valorCampo($v): string {
    if (is_array($v)) {
        if (isset($v['LookupValue'])) return (string)$v['LookupValue'];
        if (isset($v[0]) && is_array($v[0]) && isset($v[0]['LookupValue'])) return implode('; ', array_map(fn($x) => (string)($x['LookupValue'] ?? ''), $v));
        return implode('; ', array_map('strval', array_filter($v, 'is_scalar')));
    }
    if ($v === true) return 'SI';
    if ($v === false) return 'NO';
    return (string)($v ?? '');
}
// Nombres internos de la lista Tutelas (los mismos del portal de clientes); si alguno no existe se busca por el nombre visible.
const CAMPOS = [
    'NoTutela' => ['No_x0020_Tutela', ['no tutela', 'numero tutela']], 'Cliente' => ['Cliente', ['cliente']], 'Entidad' => ['Entidad', ['entidad']], 'Juzgado' => ['juzgado', ['juzgado']],
    'Ciudad' => ['Ciudad', ['ciudad']], 'FechaNotificacion' => ['fecha_x0020_Notificacion', ['fecha notificacion']], 'Vencimiento' => ['Vencimiento', ['vencimiento', 'fecha vencimiento']],
    'TipoRespuesta' => ['Tipo_x0020_Respuesta', ['tipo respuesta']], 'Usuario' => ['Usuario', ['usuario']], 'NoIdentificacion' => ['No_x0020_Identificacion', ['no identificacion']],
    'Abogado' => ['Abogado_x0020_Tutela', ['abogado tutela', 'abogado respuesta']], 'Contestada' => ['Contestada', ['contestada']], 'FechaContestacion' => ['FechaContestacion', ['fecha contestacion']],
    'MedidaCautelar' => ['Medida_x0020_Cautelar', ['medida cautelar']],
];
function leerTutelasDeSharePoint(callable $normalizar): array {
    $c = cfg();
    $sitio = graphGet('/sites/' . $c['sp_host'] . ':' . ($c['sitio_tutelas'] ?? '/sites/TutelasMDABOGADOS') . '?$select=id')['id'];
    $lista = null;
    foreach (graphTodos('/sites/' . $sitio . '/lists?$select=id,displayName&$top=200') as $l) { if ($normalizar((string)($l['displayName'] ?? '')) === $normalizar((string)($c['lista_tutelas'] ?? 'Tutelas'))) { $lista = $l['id']; break; } }
    if (!$lista) throw new RuntimeException('No encontré la lista «' . ($c['lista_tutelas'] ?? 'Tutelas') . '» en SharePoint.');
    $cols = graphTodos('/sites/' . $sitio . '/lists/' . $lista . '/columns?$select=name,displayName,lookup,personOrGroup&$top=500');
    $nombres = array_column($cols, 'name');
    $mapa = [];
    foreach (CAMPOS as $clave => [$interno, $pistas]) {
        $mapa[$clave] = in_array($interno, $nombres, true) ? $interno : null;
        if (!$mapa[$clave]) foreach ($pistas as $p) { foreach ($cols as $col) if ($normalizar((string)($col['displayName'] ?? '')) === $normalizar($p)) { $mapa[$clave] = $col['name']; break 2; } }
    }
    $items = graphTodos('/sites/' . $sitio . '/lists/' . $lista . '/items?$expand=fields&$top=200');
    // Las columnas de tipo Búsqueda/Persona (p. ej. «Cliente») vienen vacías con $expand=fields a secas: segunda pasada solo con ellas.
    $especiales = [];
    foreach ($cols as $col) if (!empty($col['lookup']) || !empty($col['personOrGroup'])) $especiales[] = $col['name'];
    if ($especiales) {
        $porId = [];
        foreach (graphTodos('/sites/' . $sitio . '/lists/' . $lista . '/items?$expand=fields($select=' . implode(',', $especiales) . ')&$top=200') as $it) $porId[$it['id']] = $it['fields'] ?? [];
        foreach ($items as $k => $it) if (isset($porId[$it['id']])) $items[$k]['fields'] = array_merge($it['fields'] ?? [], $porId[$it['id']]);
    }
    $salida = [];
    foreach ($items as $it) {
        $f = $it['fields'] ?? []; $x = [];
        foreach ($mapa as $clave => $interno) $x[$clave] = $interno ? valorCampo($f[$interno] ?? '') : '';
        $salida[] = $x;
    }
    return $salida;
}

// ---------- fechas y reglas ----------
/** Instante ISO (UTC) o fecha → [aaaa-mm-dd, hh:mm] en hora de Bogotá; hh:mm vacío si es medianoche (solo fecha). */
function aBogota(string $v): array {
    $v = trim($v);
    if ($v === '') return ['', ''];
    try { $d = new DateTime($v); $d->setTimezone(new DateTimeZone('America/Bogota')); }
    catch (Throwable $e) { return ['', '']; }
    $hora = $d->format('H:i');
    return [$d->format('Y-m-d'), $hora === '00:00' ? '' : $hora];
}
function dma(string $iso): string { return preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $iso, $m) ? "$m[3]/$m[2]/$m[1]" : ''; }
function esSi(string $v): bool { return in_array(mb_strtolower(trim($v)), ['si', 'sí', 'true', '1', 'yes'], true); }
function e(string $t): string { return htmlspecialchars($t, ENT_QUOTES, 'UTF-8'); }

/** Tutelas listas para el correo: { fecha, hora, ... } y los grupos por urgencia. */
function prepararTutelas(array $crudas, string $hoy): array {
    $limiteVencidas = date('Y-m-d', strtotime($hoy . ' -10 days'));
    $filas = [];
    foreach ($crudas as $x) {
        [$venc, $hora] = aBogota((string)($x['Vencimiento'] ?? ''));
        [$notif] = aBogota((string)($x['FechaNotificacion'] ?? ''));
        $contestada = esSi((string)($x['Contestada'] ?? ''));
        if ($contestada || $venc === '' || $venc < $limiteVencidas) continue;
        $filas[] = [
            'No' => trim((string)($x['NoTutela'] ?? '')), 'Accionante' => trim((string)($x['Usuario'] ?? '')), 'Cedula' => trim((string)($x['NoIdentificacion'] ?? '')), 'Cliente' => trim((string)($x['Cliente'] ?? '')),
            'Entidad' => trim((string)($x['Entidad'] ?? '')), 'Juzgado' => trim((string)($x['Juzgado'] ?? '')), 'Ciudad' => trim((string)($x['Ciudad'] ?? '')), 'Abogado' => trim((string)($x['Abogado'] ?? '')),
            'Tipo' => trim((string)($x['TipoRespuesta'] ?? '')), 'Medida' => trim((string)($x['MedidaCautelar'] ?? '')), 'Notificacion' => $notif, 'Vencimiento' => $venc, 'Hora' => $hora,
            'dias' => (int)round((strtotime($venc) - strtotime($hoy)) / 86400),
        ];
    }
    usort($filas, fn($a, $b) => strcmp($a['Vencimiento'] . ($a['Hora'] ?: '99:99'), $b['Vencimiento'] . ($b['Hora'] ?: '99:99')));
    return $filas;
}

// ---------- el correo ----------
function tablaHtml(array $filas, string $vacio): string {
    if (!$filas) return '<p style="margin:0 0 14px;color:#5c6b68;font-size:13px;">' . e($vacio) . '</p>';
    $th = 'padding:6px 8px;background:#004941;color:#fff;font-size:12px;text-align:left;border:1px solid #004941;';
    $td = 'padding:5px 8px;font-size:12.5px;border:1px solid #e0e4e2;vertical-align:top;';
    $h = '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin:0 0 16px;"><tr><th style="' . $th . '">Vence</th><th style="' . $th . '">Tutela</th><th style="' . $th . '">Accionante</th><th style="' . $th . '">Entidad / cliente</th><th style="' . $th . '">Abogado</th><th style="' . $th . '">Juzgado</th></tr>';
    foreach ($filas as $f) {
        $rojo = $f['dias'] < 0 ? 'color:#a3281c;font-weight:700;' : ($f['dias'] === 0 ? 'color:#b3590a;font-weight:700;' : '');
        $h .= '<tr><td style="' . $td . $rojo . 'white-space:nowrap;">' . e(dma($f['Vencimiento']) . ($f['Hora'] ? ' ' . $f['Hora'] : '')) . '</td><td style="' . $td . 'white-space:nowrap;"><strong>' . e($f['No']) . '</strong>' . ($f['Medida'] !== '' && esSi($f['Medida']) ? ' <span style="color:#a3281c;">· medida cautelar</span>' : '') . '</td><td style="' . $td . '">' . e($f['Accionante']) . ($f['Cedula'] !== '' ? '<br><span style="color:#5c6b68;">CC ' . e($f['Cedula']) . '</span>' : '') . '</td><td style="' . $td . '">' . e($f['Entidad']) . ($f['Cliente'] !== '' ? '<br><span style="color:#5c6b68;">' . e($f['Cliente']) . '</span>' : '') . '</td><td style="' . $td . '">' . e($f['Abogado']) . '</td><td style="' . $td . '">' . e($f['Juzgado']) . '</td></tr>';
    }
    return $h . '</table>';
}
function armarCorreo(array $filas, string $hoy, string $generado): array {
    $vencidas = array_values(array_filter($filas, fn($f) => $f['dias'] < 0));
    $hoyF = array_values(array_filter($filas, fn($f) => $f['dias'] === 0));
    $proximas = array_values(array_filter($filas, fn($f) => $f['dias'] >= 1 && $f['dias'] <= 2));
    $resto = array_values(array_filter($filas, fn($f) => $f['dias'] > 2));
    $asunto = 'Respaldo Tutelas - ' . dma($hoy) . ' - ' . count($hoyF) . ' vencen hoy, ' . count($vencidas) . ' vencidas sin contestar';
    $html = '<div style="font-family:\'Segoe UI\',Arial,sans-serif;color:#1c2624;max-width:960px;">'
        . '<p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#004941;">Respaldo diario de Tutelas</p>'
        . '<p style="margin:0 0 14px;font-size:13px;color:#5c6b68;">Generado el ' . e($generado) . ' (hora de Colombia) desde SharePoint. Si Microsoft está caído, esta es la última lista disponible: puede estar desactualizada desde esa hora.</p>'
        . '<p style="margin:0 0 14px;font-size:14px;"><strong>' . count($hoyF) . '</strong> vencen hoy · <strong>' . count($proximas) . '</strong> vencen mañana o pasado · <strong style="color:#a3281c;">' . count($vencidas) . '</strong> vencidas sin contestar (últimos 10 días) · <strong>' . count($resto) . '</strong> con más plazo.</p>'
        . '<p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#a3281c;">Vencidas sin contestar (últimos 10 días)</p>' . tablaHtml($vencidas, 'Ninguna.')
        . '<p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#b3590a;">Vencen HOY</p>' . tablaHtml($hoyF, 'Ninguna vence hoy.')
        . '<p style="margin:0 0 4px;font-size:14px;font-weight:700;">Vencen mañana y pasado mañana</p>' . tablaHtml($proximas, 'Ninguna.')
        . '<p style="margin:0 0 4px;font-size:14px;font-weight:700;">Con más plazo</p>' . tablaHtml($resto, 'Ninguna.')
        . '<p style="margin:10px 0 0;font-size:12px;color:#5c6b68;">En el CSV adjunto va el mismo detalle con todas las columnas (ábralo con Excel). «Pendiente» = no contestada, con vencimiento de hace hasta 10 días o futuro.</p></div>';
    $enc = ['Vence', 'Hora', 'Tutela', 'Accionante', 'Cédula', 'Entidad', 'Cliente', 'Abogado', 'Juzgado', 'Ciudad', 'Tipo de respuesta', 'Medida cautelar', 'Notificación', 'Estado'];
    $csv = "\xEF\xBB\xBF" . implode(';', $enc) . "\r\n";
    $q = fn(string $t) => '"' . str_replace('"', '""', $t) . '"';
    foreach ($filas as $f) {
        $estado = $f['dias'] < 0 ? 'VENCIDA sin contestar' : ($f['dias'] === 0 ? 'Vence HOY' : 'Pendiente');
        $csv .= implode(';', array_map($q, [dma($f['Vencimiento']), $f['Hora'], $f['No'], $f['Accionante'], $f['Cedula'], $f['Entidad'], $f['Cliente'], $f['Abogado'], $f['Juzgado'], $f['Ciudad'], $f['Tipo'], $f['Medida'], dma($f['Notificacion']), $estado])) . "\r\n";
    }
    return [$asunto, $html, $csv];
}

// ---------- envío del correo ----------
// Dos formas (config «envio»), ninguna usa Microsoft:
//   · 'servidor' (por defecto): sale directo desde el servidor de cPanel con mail(), «de» una dirección @lexaraabogados.com. El SPF de lexaraabogados.com ya incluye la IP de ese servidor
//     (190.8.176.243) y el DMARC lo exige alineado: por eso Gmail lo acepta sin clave alguna. No necesita contraseñas.
//   · 'gmail': SMTP de Gmail con una clave de aplicación (si Google deja crearla).
//   · 'archivo': solo para pruebas: guarda el correo en privado/ultimo-correo.eml sin enviarlo.
/** Arma el correo (MIME): HTML en el cuerpo y, si hay, el CSV adjunto. Devuelve [cabeceras sin Para/Asunto, cuerpo]. */
function armarMime(string $desde, string $nombre, string $html, ?string $csv, string $nombreCsv): array {
    $lim = 'lexara_' . bin2hex(random_bytes(8));
    $dominio = substr(strrchr($desde, '@'), 1) ?: 'localhost';
    $cab = "From: =?UTF-8?B?" . base64_encode($nombre) . "?= <" . $desde . ">\r\nReply-To: " . $desde . "\r\nDate: " . date('r') . "\r\nMessage-ID: <" . bin2hex(random_bytes(12)) . '@' . $dominio . ">\r\nX-Auto-Response-Suppress: All\r\nMIME-Version: 1.0";
    $texto = trim(html_entity_decode(strip_tags(preg_replace('#</(p|div|tr|h\d)>#i', "\n", $html)), ENT_QUOTES, 'UTF-8'));
    if ($csv !== null) {
        $cab .= "\r\nContent-Type: multipart/mixed; boundary=\"$lim\"";
        $alt = 'alt_' . bin2hex(random_bytes(6));
        $cuerpo = "--$lim\r\nContent-Type: multipart/alternative; boundary=\"$alt\"\r\n\r\n"
            . "--$alt\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($texto))
            . "--$alt\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($html)) . "--$alt--\r\n"
            . "--$lim\r\nContent-Type: text/csv; charset=UTF-8; name=\"$nombreCsv\"\r\nContent-Disposition: attachment; filename=\"$nombreCsv\"\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($csv)) . "--$lim--\r\n";
    } else {
        $cab .= "\r\nContent-Type: multipart/alternative; boundary=\"$lim\"";
        $cuerpo = "--$lim\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($texto))
            . "--$lim\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($html)) . "--$lim--\r\n";
    }
    return [$cab, $cuerpo];
}
function smtpLeer($f): string {
    $r = '';
    while (($l = fgets($f, 1024)) !== false) { $r .= $l; if (strlen($l) < 4 || $l[3] === ' ') break; }
    return $r;
}
function smtpCmd($f, string $cmd, array $esperados): string {
    if ($cmd !== '') fwrite($f, $cmd . "\r\n");
    $r = smtpLeer($f);
    if (!in_array((int)substr($r, 0, 3), $esperados, true)) throw new RuntimeException('Gmail respondió «' . trim(substr($r, 0, 200)) . '» a ' . (str_starts_with($cmd, 'AUTH') || $cmd === '' ? 'la conexión' : strtok($cmd, ' ')) . '.');
    return $r;
}
function enviarCorreo(string $asunto, string $html, ?string $csv, string $nombreCsv): void {
    global $privado;
    $c = cfg();
    $modo = (string)($c['envio'] ?? 'servidor');
    $nombre = (string)($c['nombre_remitente'] ?? 'Respaldo Tutelas Lexara');
    $para = array_values(array_filter(array_map('trim', (array)($c['destinatarios'] ?? [])), fn($p) => filter_var($p, FILTER_VALIDATE_EMAIL)));
    if (!$para) throw new RuntimeException('Falta destinatarios en config.php (los correos a los que llega el respaldo).');
    $asuntoCod = '=?UTF-8?B?' . base64_encode($asunto) . '?=';

    if ($modo === 'gmail') {
        $usuario = (string)($c['gmail_usuario'] ?? ''); $clave = str_replace(' ', '', (string)($c['gmail_clave_app'] ?? ''));
        if ($usuario === '' || $clave === '' || str_contains($clave, 'PEGA_AQUI')) throw new RuntimeException('Faltan gmail_usuario y gmail_clave_app en config.php.');
        [$cab, $cuerpo] = armarMime($usuario, $nombre, $html, $csv, $nombreCsv);
        $host = (string)($c['smtp_host'] ?? 'smtp.gmail.com'); $puerto = (int)($c['smtp_puerto'] ?? 465); $seguro = ($c['smtp_seguro'] ?? true) !== false;
        $f = @stream_socket_client(($seguro ? 'ssl://' : 'tcp://') . $host . ':' . $puerto, $errno, $errstr, 30);
        if (!$f) throw new RuntimeException('No se pudo conectar con ' . $host . ': ' . $errstr);
        stream_set_timeout($f, 40);
        try {
            smtpCmd($f, '', [220]); smtpCmd($f, 'EHLO respaldo.lexaraabogados.com', [250]);
            smtpCmd($f, 'AUTH LOGIN', [334]); smtpCmd($f, base64_encode($usuario), [334]); smtpCmd($f, base64_encode($clave), [235]);
            smtpCmd($f, 'MAIL FROM:<' . $usuario . '>', [250]);
            foreach ($para as $p) smtpCmd($f, 'RCPT TO:<' . $p . '>', [250, 251]);
            smtpCmd($f, 'DATA', [354]);
            $m = 'To: ' . implode(', ', $para) . "\r\nSubject: " . $asuntoCod . "\r\n" . $cab . "\r\n\r\n" . $cuerpo;
            $m = preg_replace('/^\./m', '..', $m);   // «dot-stuffing»
            fwrite($f, $m . "\r\n.\r\n");
            smtpCmd($f, '', [250]); smtpCmd($f, 'QUIT', [221]);
        } finally { fclose($f); }
        return;
    }

    $desde = (string)($c['remitente'] ?? 'tutelas@lexaraabogados.com');
    if (!filter_var($desde, FILTER_VALIDATE_EMAIL)) throw new RuntimeException('El remitente de config.php no es un correo válido.');
    [$cab, $cuerpo] = armarMime($desde, $nombre, $html, $csv, $nombreCsv);
    if ($modo === 'archivo') {
        file_put_contents($privado . '/ultimo-correo.eml', 'To: ' . implode(', ', $para) . "\r\nSubject: " . $asuntoCod . "\r\n" . $cab . "\r\n\r\n" . $cuerpo);
        return;
    }
    if (!function_exists('mail')) throw new RuntimeException('Este servidor no tiene la función mail() de PHP.');
    // Se envía a cada destinatario por separado (así un correo mal escrito no frena a los demás). «-f» fija el remitente de sobre (el SPF se evalúa contra él).
    $fallos = [];
    foreach ($para as $p) {
        $ok = @mail($p, $asuntoCod, $cuerpo, $cab, '-f' . $desde);
        if (!$ok) $ok = @mail($p, $asuntoCod, $cuerpo, $cab);   // algunos servidores no permiten indicar el remitente de sobre
        if (!$ok) $fallos[] = $p;
    }
    if ($fallos) throw new RuntimeException('El servidor no aceptó el correo para: ' . implode(', ', $fallos) . '.');
}

// ---------- programa principal ----------
if (isset($opc['probar-correo'])) {
    try { enviarCorreo('Prueba del respaldo de Tutelas', '<p style="font-family:Arial;">Si lee este correo, el envío del respaldo de Tutelas funciona.' . e(date('d/m/Y H:i')) . '</p>', null, ''); registrar('Correo de prueba enviado.'); exit(0); }
    catch (Throwable $x) { terminar('No se pudo enviar el correo de prueba: ' . $x->getMessage()); }
}
try {
    if (isset($opc['simular'])) {
        $crudas = json_decode((string)file_get_contents($opc['simular']), true);
        if (!is_array($crudas)) terminar('No pude leer el archivo de ejemplo.');
        registrar('MODO PRUEBA: datos de ' . $opc['simular']);
    } else {
        $crudas = leerTutelasDeSharePoint($normalizar);
        registrar('SharePoint: ' . count($crudas) . ' tutelas leídas.');
    }
    $hoy = date('Y-m-d');
    $filas = prepararTutelas($crudas, $hoy);
    [$asunto, $html, $csv] = armarCorreo($filas, $hoy, date('d/m/Y H:i'));
    $nombreCsv = 'Tutelas pendientes ' . $hoy . '.csv';
    if (isset($opc['solo-mostrar'])) {
        file_put_contents($privado . '/ultimo-respaldo.html', '<meta charset="utf-8"><title>' . e($asunto) . '</title>' . $html);
        file_put_contents($privado . '/ultimo-respaldo.csv', $csv);
        registrar('Guardado privado/ultimo-respaldo.html y .csv (' . count($filas) . ' tutelas pendientes). No se envió.');
        exit(0);
    }
    enviarCorreo($asunto, $html, $csv, $nombreCsv);
    registrar('Respaldo enviado (' . count($filas) . ' tutelas pendientes): ' . $asunto);
} catch (Throwable $x) {
    terminar($x->getMessage());
}
