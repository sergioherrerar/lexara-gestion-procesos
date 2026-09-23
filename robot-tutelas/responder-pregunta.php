<?php
// "Chat IA" (Tutelas) — pestaña "Preguntas" de "Entrenar IA" (2026-09-23,
// pedido explícito del usuario). A diferencia de extraer-tutela.php (que
// LEE un correo y arma un borrador), este archivo responde preguntas sobre
// las tutelas YA CARGADAS en el portal (ej. "¿cuántas de Colmédica por
// Tema?") — no guarda nada, no toca SharePoint, solo responde con texto.
// Vive en la misma carpeta robot-tutelas/ (fuera de public_html/app/, que
// se reemplaza entero en cada publicación del portal) y reusa el mismo
// config.php (misma clave de la API de Claude).

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

$pregunta = trim((string)($entrada['pregunta'] ?? ''));
$tutelas = is_array($entrada['tutelas'] ?? null) ? $entrada['tutelas'] : [];
// "Preguntas" desde "Leer correo (IA)" (2026-09-24, pedido explícito del
// usuario: "de la tutela [recién extraída] dime quién es el usuario, qué
// están solicitando, quiénes están vinculados, las pretensiones...") — el
// correo que Claude ACABA de analizar (puede que esa tutela ni siquiera
// esté guardada todavía). Trae más detalle que la tabla de abajo: el
// asunto/cuerpo real del correo, no solo los campos ya resumidos.
$casoActual = is_array($entrada['casoActual'] ?? null) ? $entrada['casoActual'] : null;

if(!$pregunta){
    http_response_code(400);
    echo json_encode(['error' => 'Falta la pregunta.']);
    exit;
}
if(!$tutelas && !$casoActual){
    http_response_code(400);
    echo json_encode(['error' => 'No hay tutelas cargadas en el portal para responder sobre ellas.']);
    exit;
}

// Límite de seguridad — no mandar una cantidad absurda de filas a la API
// (costo/tamaño de la solicitud). Con más de esto, se recorta a las
// primeras y se avisa a Claude que la lista está incompleta, para que no
// responda conteos totales como si fueran exactos.
$limiteFilas = 1200;
$incompleta = count($tutelas) > $limiteFilas;
if($incompleta){ $tutelas = array_slice($tutelas, 0, $limiteFilas); }

$columnas = ['NoTutela','Cliente','Entidad','Prestacion','TipoRespuesta','Tema','FechaNotificacion','FechaVencimiento','Usuario','Solicita'];
$filas = [implode('|', $columnas)];
foreach($tutelas as $t){
    $fila = [];
    foreach($columnas as $c){
        // "Solicita" puede ser largo (texto enriquecido, ya viene como
        // texto plano desde el portal) — se recorta para no inflar de más
        // la solicitud; para las demás columnas no hace falta.
        $valor = (string)($t[$c] ?? '');
        if($c === 'Solicita' && mb_strlen($valor) > 200){ $valor = mb_substr($valor, 0, 200) . '…'; }
        $valor = str_replace(["\n","\r","|"], [' ',' ','/'], $valor);
        $fila[] = $valor;
    }
    $filas[] = implode('|', $fila);
}
$tabla = implode("\n", $filas);

$avisoIncompleta = $incompleta
    ? "\n\nAVISO: la lista de abajo NO incluye todas las tutelas (se recortó a las primeras {$limiteFilas} por límite de tamaño) — si la pregunta necesita un conteo total exacto y sospechas que puede haber más filas de las mostradas, acláraselo al usuario en vez de dar un número como si fuera definitivo."
    : '';

// Bloque del caso recién leído (ver nota arriba sobre $casoActual) — se le
// da MÁS peso que la tabla general, con el asunto/cuerpo real del correo
// (ahí suele estar el detalle de pretensiones/vinculados que no cabe en los
// campos fijos de la tabla) más los registros que Claude ya extrajo.
$casoActualTexto = '';
if($casoActual){
    $asuntoCaso = (string)($casoActual['asunto'] ?? '');
    $cuerpoCaso = (string)($casoActual['cuerpo'] ?? '');
    if(mb_strlen($cuerpoCaso) > 6000){ $cuerpoCaso = mb_substr($cuerpoCaso, 0, 6000) . '…'; }
    $registrosCaso = is_array($casoActual['registros'] ?? null) ? $casoActual['registros'] : [];
    $registrosTexto = $registrosCaso ? json_encode($registrosCaso, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) : '(sin campos extraídos)';
    $casoActualTexto = "\n\nCASO QUE SE ACABA DE LEER CON \"Leer correo (IA)\" AHORA MISMO (dale MÁS prioridad que la tabla de tutelas de abajo cuando la pregunta se refiera a \"esta tutela\"/\"este caso\" o mencione su número — ADEMÁS, esta tutela puede que TODAVÍA NO esté guardada en el portal, así que puede no aparecer en esa tabla):\n" .
        "Asunto del correo: {$asuntoCaso}\n\nCuerpo del correo (fuente completa, úsalo para detalles como pretensiones, quiénes están vinculados, etc. que no quepan en los campos de abajo):\n{$cuerpoCaso}\n\n" .
        "Campos que Claude ya extrajo de este caso (uno por cliente vinculado, si aplica):\n{$registrosTexto}";
}

$instrucciones = "Eres un asistente del despacho de abogados \"md abogados sas\", ayudas a responder preguntas sobre sus tutelas reales usando el portal Lexara. " .
    "A continuación tienes la lista de tutelas actualmente cargadas en el portal, en formato tabla — una tutela por línea, columnas separadas por \"|\", en este orden: " . implode(', ', $columnas) . "." .
    $avisoIncompleta .
    $casoActualTexto .
    "\n\nResponde la pregunta del usuario basándote ÚNICAMENTE en estos datos reales — nunca inventes números, nombres, fechas o casos que no estén acá. Si la pregunta no se puede responder con certeza a partir de estos datos, dilo claramente en vez de adivinar. Responde en español, de forma clara, breve y directa, como si le hablaras a un abogado colega — puedes usar listas o números cuando ayude a la claridad.\n\nDATOS (fecha de hoy: " . date('Y-m-d') . "):\n{$tabla}";

$body = [
    'model' => 'claude-sonnet-5',
    'max_tokens' => 1500,
    'system' => $instrucciones,
    'messages' => [
        ['role' => 'user', 'content' => $pregunta],
    ],
];

$ch = curl_init('https://api.anthropic.com/v1/messages');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'content-type: application/json',
    'x-api-key: ' . $apiKey,
    'anthropic-version: 2023-06-01',
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
curl_setopt($ch, CURLOPT_TIMEOUT, 60);
$respuesta = curl_exec($ch);
$codigoHttp = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$errorCurl = curl_error($ch);
curl_close($ch);

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

echo json_encode(['respuesta' => trim($texto)]);
