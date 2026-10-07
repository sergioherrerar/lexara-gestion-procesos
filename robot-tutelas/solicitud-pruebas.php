<?php
// "Solicitud de pruebas" — paso 2 de "API Claude" (2026-10-07, pedido explícito
// del usuario: "a cada correo leído por LexIA va a crear un correo en
// borradores"). Recibe los datos de UNA tutela ya extraída por LexIA (campos +
// Analisis) y el TEXTO vigente del documento "FORMATO SOLICITUD DE PRUEBAS"
// (que vive en SharePoint, sitio TutelasMDABOGADOS → Documentos; el portal lo
// lee cada vez, así cualquier cambio al Word se refleja solo) y devuelve el
// correo ya armado: destinatarios, copia, asunto y cuerpo. No envía nada ni
// guarda nada: el portal crea el BORRADOR en Outlook y el abogado lo revisa y
// lo envía.
//
// Vive en la misma carpeta que los otros robots (public_html/robot-tutelas/) y
// reusa config.php (misma clave de la API de Claude) y lexia-especialista.php.

header('Content-Type: application/json; charset=utf-8');
$origenesPermitidos = ['https://sergioherrerar.github.io', 'https://www.lexaraabogados.com'];
$origen = $_SERVER['HTTP_ORIGIN'] ?? '';
if(in_array($origen, $origenesPermitidos, true)){
    header('Access-Control-Allow-Origin: ' . $origen);
}
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if($_SERVER['REQUEST_METHOD'] === 'OPTIONS'){ http_response_code(204); exit; }
if($_SERVER['REQUEST_METHOD'] !== 'POST'){
    http_response_code(405);
    echo json_encode(['error' => 'Método no permitido.']);
    exit;
}

@set_time_limit(120);
@ini_set('memory_limit', '256M');

require_once __DIR__ . '/lexia-especialista.php';
$configPath = __DIR__ . '/config.php';
if(!file_exists($configPath)){
    http_response_code(500);
    echo json_encode(['error' => 'Falta config.php en el servidor.']);
    exit;
}
$config = require $configPath;
$apiKey = $config['anthropic_api_key'] ?? '';
if(!$apiKey || $apiKey === 'PEGA_AQUI_TU_CLAVE_REAL'){
    http_response_code(500);
    echo json_encode(['error' => 'El robot todavía no tiene configurada la clave real de la API de Claude en config.php.']);
    exit;
}

$entrada = json_decode(file_get_contents('php://input'), true);
if(!is_array($entrada)){
    http_response_code(400);
    echo json_encode(['error' => 'Solicitud inválida (no llegó un JSON válido).']);
    exit;
}

$formato = trim((string)($entrada['formato'] ?? ''));
$registro = is_array($entrada['registro'] ?? null) ? $entrada['registro'] : [];
$asuntoCorreo = (string)($entrada['asuntoCorreo'] ?? '');
$vencimiento = (string)($entrada['fechaVencimiento'] ?? '');     // aaaa-mm-dd
$noTutela = (string)($entrada['noTutela'] ?? ($registro['NoTutela'] ?? ''));
if($formato === ''){
    http_response_code(400);
    echo json_encode(['error' => 'No llegó el texto del formato de solicitud de pruebas (revisa que el documento esté en SharePoint).']);
    exit;
}
if(!$registro){
    http_response_code(400);
    echo json_encode(['error' => 'No llegaron los datos de la tutela.']);
    exit;
}
$vencimientoLegible = '';
if(preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $vencimiento, $m)){
    $vencimientoLegible = $m[3] . '/' . $m[2] . '/' . $m[1];
}

$tarea = <<<'TXT'

TAREA ACTUAL: armar el CORREO DE SOLICITUD DE PRUEBAS de UNA tutela, usando el documento "FORMATO SOLICITUD DE PRUEBAS" del despacho que va más abajo (es la fuente oficial y vigente: su agenda de áreas/correos y sus formatos). Reglas:
1. Elige el o los formatos del documento que correspondan a lo que realmente pide la tutela (usa Prestacion, Tema, Solicita y Analisis del registro). Si la tutela pide varias cosas, combina los bloques que apliquen sin duplicar instrucciones. Si ningún formato encaja del todo, usa el más cercano y agrega solo las solicitudes puntuales que la tutela exija.
2. Mantén la redacción y el orden de los bloques del formato (saludo, "Tutela que VENCE DÍA ...", "PRETENSIÓN: ...", áreas y sus viñetas). Reemplaza los marcadores por los datos reales: DD/MM/AA = la fecha de vencimiento que se te da (formato dd/mm/aaaa), y los puntos suspensivos o rayas por el diagnóstico, servicio, medicamento, especialidad o valor concretos de ESTA tutela. Si un dato no está en el registro, deja el marcador en corchetes para que el abogado lo complete, por ejemplo [especialidad]. No inventes datos.
3. Incluye solo las áreas y entidades que aplican al Cliente de este registro y a lo pedido. Respeta lo que dice el documento: p. ej., si la tutela es contra Colmédica y Aliansalud, o contra Aliansalud y el usuario está afiliado a prepagada, se pide la información de las dos entidades al área médica de Colmédica.
4. Destinatarios (para): los correos de la AGENDA del documento para las áreas a las que SÍ se les pide información en este correo — usa solo correos que aparezcan en la agenda, escritos exactamente igual, sin inventar ninguno. Si un área tiene un principal y suplentes, incluye todos los de esa área. Copia (cc): el área jurídica de la entidad (Dania Carolina Pachón), con el correo del dominio que corresponda al Cliente del registro (aliansalud.com.co, colmedica.com o umd.com.co), tal como esté en la agenda. Si no puedes determinar a quién enviar, deja "para" vacío y explícalo en "notas".
5. Asunto: "TUTELA No. <NoTutela> - SOLICITUD DE PRUEBAS - VENCE <dd/mm/aaaa>" seguido del nombre corto del Cliente cuando aporte claridad (p. ej. "- ALIANSALUD").
6. Cuerpo en TEXTO PLANO (sin markdown): una frase por línea, los títulos de área terminados en dos puntos, las viñetas empezando con "- ". Termina con una línea de despedida breve y cordial ("Quedo atenta a su respuesta. Cordial saludo,"). No pongas firma ni datos de contacto: el abogado la agrega.
7. En "notas" (texto breve, para el abogado, NO va en el correo) anota: qué formato(s) usaste, qué datos quedaron pendientes entre corchetes, y cualquier alerta relevante (por ejemplo, vencimiento muy cercano o algo que el área jurídica deba revisar, como el aviso del formato sobre contraindicaciones).

Devuelve SOLO un objeto JSON (sin bloques de markdown ni texto adicional) con esta forma exacta:
{"para": ["correo1", "correo2"], "cc": ["correo"], "asunto": "...", "cuerpo": "...", "notas": "..."}
TXT;

$instrucciones = "Eres LexIA, el asistente de inteligencia artificial del despacho de abogados \"md abogados sas\". Si en algún texto necesitas referirte a ti misma, usa SIEMPRE el nombre \"LexIA\".\n\n" . lexiaEspecialista() . "\n" . $tarea;

$documentoFormato = "DOCUMENTO \"FORMATO SOLICITUD DE PRUEBAS\" (texto vigente, tal como está hoy en SharePoint; las tablas vienen con las celdas separadas por \" | \"):\n\n" . $formato;

$datosTutela = "DATOS DE LA TUTELA (extraídos por LexIA del correo y los documentos):\n" .
    json_encode($registro, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) .
    "\n\nNo. de tutela: " . $noTutela .
    "\nAsunto del correo original: " . $asuntoCorreo .
    "\nFecha de vencimiento (aaaa-mm-dd): " . ($vencimiento !== '' ? $vencimiento : '(sin fecha — deja [fecha de vencimiento] para completar)') .
    ($vencimientoLegible !== '' ? "\nFecha de vencimiento (dd/mm/aaaa) para el correo: " . $vencimientoLegible : '') .
    "\nFecha de hoy: " . date('Y-m-d');

$body = [
    'model' => 'claude-sonnet-5',
    'max_tokens' => 4000,
    'system' => [
        // El documento del formato y las instrucciones cambian poco entre una tutela y otra:
        // van en bloques con caché para que cada tutela nueva no las pague completas.
        ['type' => 'text', 'text' => $instrucciones, 'cache_control' => ['type' => 'ephemeral']],
        ['type' => 'text', 'text' => $documentoFormato, 'cache_control' => ['type' => 'ephemeral']],
    ],
    'messages' => [
        ['role' => 'user', 'content' => [['type' => 'text', 'text' => $datosTutela]]],
    ],
];

$json = json_encode($body);
for($intento = 1; $intento <= 3; $intento++){
    $ch = curl_init('https://api.anthropic.com/v1/messages');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'content-type: application/json',
        'x-api-key: ' . $apiKey,
        'anthropic-version: 2023-06-01',
    ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $json);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 15);
    curl_setopt($ch, CURLOPT_TIMEOUT, 100);
    $respuesta = curl_exec($ch);
    $codigoHttp = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $errorCurl = curl_error($ch);
    curl_close($ch);
    $pasajero = !$errorCurl && ($codigoHttp === 429 || $codigoHttp === 529 || $codigoHttp >= 500);
    if(!$pasajero || $intento === 3) break;
    sleep(3 * $intento);
}

if($errorCurl){
    http_response_code(502);
    echo json_encode(['error' => 'No se pudo conectar con la API de Claude: ' . $errorCurl]);
    exit;
}
$data = json_decode($respuesta, true);
if($codigoHttp !== 200){
    $detalle = $data['error']['message'] ?? $respuesta;
    http_response_code(502);
    echo json_encode(['error' => "Error de la API de Claude (código {$codigoHttp}): {$detalle}"]);
    exit;
}

$texto = '';
foreach(($data['content'] ?? []) as $bloque){
    if(($bloque['type'] ?? '') === 'text'){ $texto .= $bloque['text']; }
}
$texto = trim($texto);
$posIni = strpos($texto, '{');
$posFin = strrpos($texto, '}');
$candidato = ($posIni !== false && $posFin !== false && $posFin > $posIni) ? substr($texto, $posIni, $posFin - $posIni + 1) : $texto;
$correo = json_decode($candidato, true);
if(!is_array($correo) || !isset($correo['cuerpo']) || trim((string)$correo['cuerpo']) === ''){
    http_response_code(502);
    $stopReason = (string)($data['stop_reason'] ?? '');
    $vista = trim(preg_replace('/\s+/u', ' ', function_exists('mb_substr') ? mb_substr($texto, 0, 240) : substr($texto, 0, 240)));
    echo json_encode(['error' => 'No se pudo leer la respuesta de LexIA para el correo de solicitud de pruebas' . ($stopReason === 'max_tokens' ? ' (quedó cortada por ser muy larga)' : '') . ($vista !== '' ? ': "' . $vista . '"' : '.')], JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

// Limpieza mínima de lo que devolvió: solo correos con forma de correo, sin repetidos.
function soloCorreos($lista){
    $salida = [];
    foreach((is_array($lista) ? $lista : []) as $c){
        $c = trim((string)$c);
        if(filter_var($c, FILTER_VALIDATE_EMAIL) && !in_array(strtolower($c), array_map('strtolower', $salida), true)){
            $salida[] = $c;
        }
    }
    return $salida;
}
echo json_encode([
    'para' => soloCorreos($correo['para'] ?? []),
    'cc' => soloCorreos($correo['cc'] ?? []),
    'asunto' => trim((string)($correo['asunto'] ?? '')),
    'cuerpo' => trim((string)$correo['cuerpo']),
    'notas' => trim((string)($correo['notas'] ?? '')),
], JSON_UNESCAPED_UNICODE);
