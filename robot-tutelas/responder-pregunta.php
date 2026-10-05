<?php
// "Chat IA" (Tutelas) — pestaña "Preguntas" de "Entrenar IA" (2026-09-23,
// pedido explícito del usuario). A diferencia de extraer-tutela.php (que
// LEE un correo y arma un borrador), este archivo responde preguntas sobre
// tutelas ya leídas/extraídas por LexIA — no guarda nada, no toca
// SharePoint, solo responde con texto. Vive en la misma carpeta
// robot-tutelas/ (fuera de public_html/app/, que se reemplaza entero en
// cada publicación del portal) y reusa el mismo config.php (misma clave
// de la API de Claude).
//
// 2026-09-29, pedido explícito del usuario (por costo de la API): antes
// este archivo TAMBIÉN recibía la tabla completa de tutelas cargadas en el
// portal (hasta 1,200 filas — el gasto más grande de este endpoint, y se
// mandaba de nuevo en CADA pregunta, sin caché). Se quitó por completo:
// "Pregúntame" ahora SOLO responde con lo que ya está en $casoActual/
// $casosGuardados — los .txt que ya se guardaron en OneDrive al extraer
// cada tutela (ver guardarLecturaLexIAEnOneDrive en graph.js). Ya no puede
// responder preguntas agregadas sobre TODAS las tutelas del portal (ej.
// conteos generales) — solo sobre tutelas puntuales ya leídas por LexIA.

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
// "Preguntas" desde "Leer correo (IA)" (2026-09-24, pedido explícito del
// usuario: "de la tutela [recién extraída] dime quién es el usuario, qué
// están solicitando, quiénes están vinculados, las pretensiones...") — el
// correo que Claude ACABA de analizar (puede que esa tutela ni siquiera
// esté guardada todavía). Trae el asunto/cuerpo real del correo, no solo
// campos ya resumidos.
$casoActual = is_array($entrada['casoActual'] ?? null) ? $entrada['casoActual'] : null;
// "Le pedí algo de esta tutela y ya está leída y no encuentra
// información" (2026-09-29, pedido explícito del usuario con captura) —
// a diferencia de $casoActual (SOLO la tutela seleccionada en este
// instante en la lista), esto trae TODAS las tutelas que LexIA ya analizó
// y guardó en OneDrive pero que todavía no están guardadas en el portal —
// así se puede preguntar por cualquiera de ellas por número, sin tener
// que haber hecho clic en ese correo puntual primero.
$casosGuardados = is_array($entrada['casosGuardados'] ?? null) ? $entrada['casosGuardados'] : [];

if(!$pregunta){
    http_response_code(400);
    echo json_encode(['error' => 'Falta la pregunta.']);
    exit;
}
if(!$casoActual && !$casosGuardados){
    http_response_code(400);
    echo json_encode(['error' => 'Todavía no hay ninguna tutela leída por LexIA para responder sobre ella — usa "Extraer con LexIA" primero.']);
    exit;
}

// Bloque del caso recién leído (ver nota arriba sobre $casoActual) — se le
// da MÁS peso que las demás tutelas guardadas, con el asunto/cuerpo real
// del correo (ahí suele estar el detalle de pretensiones/vinculados) más
// los registros que Claude ya extrajo.
$casoActualTexto = '';
if($casoActual){
    $asuntoCaso = (string)($casoActual['asunto'] ?? '');
    $cuerpoCaso = (string)($casoActual['cuerpo'] ?? '');
    if(mb_strlen($cuerpoCaso) > 6000){ $cuerpoCaso = mb_substr($cuerpoCaso, 0, 6000) . '…'; }
    $registrosCaso = is_array($casoActual['registros'] ?? null) ? $casoActual['registros'] : [];
    $registrosTexto = $registrosCaso ? json_encode($registrosCaso, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) : '(sin campos extraídos)';
    $casoActualTexto = "\n\nCASO QUE SE ACABA DE LEER CON \"Leer correo (LexIA)\" AHORA MISMO (dale MÁS prioridad que las demás tutelas de abajo cuando la pregunta se refiera a \"esta tutela\"/\"este caso\" o mencione su número):\n" .
        "Asunto del correo: {$asuntoCaso}\n\nCuerpo del correo (fuente completa, úsalo para detalles como pretensiones, quiénes están vinculados, etc. que no quepan en los campos de abajo):\n{$cuerpoCaso}\n\n" .
        "Campos que LexIA ya extrajo de este caso (uno por cliente vinculado, si aplica):\n{$registrosTexto}";
}

// Bloque de las demás tutelas ya leídas por LexIA y guardadas en OneDrive
// (ver nota arriba sobre $casosGuardados) — bug real reportado 2026-09-29:
// el usuario preguntó por una tutela marcada "Ya leído por LexIA" en la
// lista, pero como nunca había hecho clic en ESE correo puntual (solo en
// otro), $casoActual no la traía y Claude respondía "no encuentro esa
// tutela". Con esto, cualquiera de las ya analizadas se puede consultar
// por número sin necesitar ese clic primero.
$casosGuardadosTexto = '';
if($casosGuardados){
    $bloques = [];
    foreach($casosGuardados as $caso){
        if(!is_array($caso)) continue;
        $asuntoG = (string)($caso['asunto'] ?? '');
        $cuerpoG = (string)($caso['cuerpo'] ?? '');
        if(mb_strlen($cuerpoG) > 3000){ $cuerpoG = mb_substr($cuerpoG, 0, 3000) . '…'; }
        $registrosG = is_array($caso['registros'] ?? null) ? $caso['registros'] : [];
        $registrosTextoG = $registrosG ? json_encode($registrosG, JSON_UNESCAPED_UNICODE) : '(sin campos extraídos)';
        $bloques[] = "Asunto: {$asuntoG}\nCuerpo: {$cuerpoG}\nCampos extraídos: {$registrosTextoG}";
    }
    if($bloques){
        $casosGuardadosTexto = "\n\nOTRAS TUTELAS YA LEÍDAS POR LEXIA, MARCADAS \"Ya leído por LexIA\" EN LA LISTA (si la pregunta menciona el número de alguna de ellas, respóndela con esta información):\n" .
            implode("\n---\n", $bloques);
    }
}

// 2026-09-25, pedido explícito del usuario: "cuando se refiera a la IA se
// nombre tal cual LexIA" — reportó una respuesta real donde Claude dijo
// "leída recién por IA" en vez de "por LexIA". Se le pide explícitamente
// que se identifique siempre con ese nombre, nunca como "la IA" genérica.
$instrucciones = "Eres LexIA, el asistente de inteligencia artificial del despacho de abogados \"md abogados sas\", integrado al portal Lexara. Cuando te refieras a ti misma en la respuesta, usa SIEMPRE el nombre \"LexIA\" — nunca digas \"la IA\", \"el asistente\" ni nada genérico. " .
    "Ayudas a responder preguntas sobre tutelas reales del despacho que ya fueron leídas/extraídas por LexIA (no tienes acceso a la lista completa de tutelas del portal — solo a las que se muestran abajo)." .
    $casoActualTexto .
    $casosGuardadosTexto .
    "\n\nResponde la pregunta del usuario basándote ÚNICAMENTE en estos datos reales — nunca inventes números, nombres, fechas o casos que no estén acá. Si la pregunta se refiere a una tutela que no aparece en ninguno de los bloques de arriba, dilo claramente en vez de adivinar. Responde en español, de forma clara, breve y directa, como si le hablaras a un abogado colega. " .
    // 2026-09-25, pedido explícito del usuario: la respuesta se muestra como
    // texto plano (no interpreta markdown) Y se lee en voz alta con síntesis
    // de voz — con "**negrita**" salía el asterisco literal en pantalla y la
    // voz decía "asterisco, asterisco" a cada rato, cortando feo la lectura.
    "NUNCA uses formato markdown (nada de **negrita**, guiones de lista, numerales #, etc.) — escribe todo en texto plano corrido, con punto y aparte si hace falta, ya que esta respuesta también se lee en voz alta.\n\nFecha de hoy: " . date('Y-m-d');

$body = [
    'model' => 'claude-sonnet-5',
    'max_tokens' => 1500,
    // Caché (2026-09-29, pedido explícito del usuario, por costo de la
    // API) — si se hacen varias preguntas seguidas sobre el mismo caso
    // (casoActual/casosGuardados no cambian entre una pregunta y la
    // siguiente), de la 2ª pregunta en adelante esto sale a ~10% del
    // precio en vez de pagarlo completo cada vez. Dura 5 minutos — normal
    // para una sesión de varias preguntas seguidas.
    'system' => [
        ['type' => 'text', 'text' => $instrucciones, 'cache_control' => ['type' => 'ephemeral']],
    ],
    'messages' => [
        ['role' => 'user', 'content' => $pregunta],
    ],
];

// Reintenta (hasta 3 intentos, con pausa) solo errores pasajeros de la API:
// 429 (límite de velocidad), 5xx y 529 ("overloaded") — 2026-10-06, revisión
// de errores pedida por el usuario. Cualquier otro error se devuelve de una.
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
    curl_setopt($ch, CURLOPT_TIMEOUT, 60);
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

echo json_encode(['respuesta' => trim($texto)]);
