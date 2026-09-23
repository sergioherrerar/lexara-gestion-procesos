<?php
// "Robot" de Lexara — Tarea 1 de "API Claude" (ver [[project_api_claude_tutelas]]
// en la memoria del proyecto). Recibe el asunto/cuerpo/adjuntos de un correo
// de Tutelas@lexaraabogados.com (ya leído por el portal vía Microsoft Graph)
// y usa la API de Claude para extraer los campos de una Tutela nueva. Nunca
// guarda nada en SharePoint — solo devuelve los campos para que el portal
// abra "Nueva tutela" ya prellenada, y el usuario revise y confirme antes
// de guardar.
//
// Vive fuera de public_html/app/ (que se reemplaza entero en cada
// publicación del portal) — sube esta carpeta completa a
// public_html/robot-tutelas/ y deja config.php (copiado de
// config.example.php, con la clave real) ahí mismo, junto a este archivo.

header('Content-Type: application/json; charset=utf-8');
// Restringido a los 2 dominios reales del portal — no "*", evita que
// cualquier otra página use este robot con nuestra clave.
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
    echo json_encode(['error' => 'Falta config.php en el servidor — copia config.example.php a config.php y pega ahí la clave real de la API de Claude.']);
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

$asunto = (string)($entrada['asunto'] ?? '');
$cuerpo = (string)($entrada['cuerpo'] ?? '');
$adjuntos = is_array($entrada['adjuntos'] ?? null) ? $entrada['adjuntos'] : [];

// Límite de seguridad — no mandar cantidades absurdas de adjuntos a la API
// (ni de costo, ni de tamaño de la solicitud). Subido de 8 a 20 (2026-09-23,
// bug real: un correo real de tutela normal ya traía más de 8 adjuntos).
if(count($adjuntos) > 20){
    http_response_code(400);
    echo json_encode(['error' => 'Demasiados adjuntos en este correo (máximo 20) — extrae los datos a mano para este caso.']);
    exit;
}

// Campos reales del formulario "Nueva tutela" (ver TutelaDrawer.jsx /
// config.js, lista "Tutelas") — se le pide a Claude exactamente estas
// claves, ni una más ni una menos, para que el portal las pueda usar
// directo sin tener que traducir nombres.
$camposEsperados = <<<TXT
- NoTutela (texto, el número/radicado de la tutela)
- Entidad (texto, casi siempre "GRUPO COLMEDICA")
- Cliente (EXACTAMENTE uno de estos 3 textos, tal cual, sin variarlos: "COLMEDICA MEDICINA PREPAGADA S.A.", "ALIANSALUD ENTIDAD PROMOTORA DE SALUD S.A.", "UNIDAD MÉDICA Y DE DIAGNÓSTICO S.A.")
- TipoVinculacionEntidad (exactamente "Accionada" o "Vinculada")
- Prestacion (exactamente "Asistencial", "Económica" o "Administrativa")
- Departamento (texto, nombre real de un departamento de Colombia)
- Ciudad (texto)
- Juzgado (texto)
- Proceso (el "número corto" del proceso, formato EXACTO aaaa-nnnnn — año de 4 dígitos, guion, número de 5 dígitos, ej. "2026-00942". Si en el correo aparece el radicado judicial completo y largo, como "23-001-40-03-003-2026-00942-00", saca de ahí SOLO esa parte año-número de 5 dígitos — nunca pongas el radicado completo en este campo)
- FechaNotificacion (fecha en formato aaaa-mm-dd)
- FechaVencimiento (fecha en formato aaaa-mm-dd)
- TipoRespuesta (exactamente uno de: ACLARACION, ALCANCE, APLAZAMIENTO, CUMPLIMIENTO FALLO, CORRECION, IMPUGNACION, MODULACION, NULIDAD, REQUERIMIENTO, TUTELA — la PRIMERA vez que se ve un caso casi siempre es TUTELA, pero léelo del contenido real del correo, no lo asumas siempre)
- MedidaCautelar (exactamente "Sí" o "No")
- AgenciaOficiosa (exactamente "Sí" o "No")
- Usuario (texto, nombre del accionante/paciente)
- NoIdentificacion (texto, cédula del accionante)
- Correo (texto, correo del juzgado que envía la notificación)
- Solicita (texto largo, resumen en tus propias palabras de qué pide la tutela)
- Tema (categoría de la tutela — ver instrucciones)
TXT;

// 2026-09-23, pedido explícito del usuario viendo un correo real: "en tema
// debe categorizar lo mejor posible según lo investigado por la IA...
// adecuar con pensamientos de abogado la mejor opción" — "Tema" en el
// portal es un desplegable que depende de "Prestación" y se llena desde una
// lista de SharePoint que puede crecer con el tiempo — el robot NO tiene
// acceso a esa lista en vivo, así que se le da la lista de categorías más
// comunes vistas hasta ahora como referencia (no necesariamente completa) y
// se le pide razonar como abogado cuál encaja mejor con el contenido real
// del correo/adjuntos, no solo por palabras clave sueltas. El usuario
// siempre revisa este campo en el formulario antes de guardar, así que si
// la categoría real no está en esta lista, elige la más parecida en
// significado — no hace falta que sea una coincidencia exacta de texto.
$temasReferencia = <<<TXT
AGENDAMIENTO DE CONSULTA, AUTORIZACIÓN Y SUMINISTRO DE SERVICIOS DE SALUD, ENTREGA DE MEDICAMENTOS, EXCLUSIÓN DE SERVICIO, EXCLUSION INVIMA, EXCLUSIÓN POR TOPES DE COBERTURA, INDICACION INVIMA, PÉRDIDA DE ANTIGÜEDAD, PORTABILIDAD, PREEXISTENCIA, PUERTA DE ENTRADA / RED NO ADSCRITA, SERVICIO CON FALLAS EN ORDEN O PRESCRIPCIÓN, SERVICIO DE CUIDADOR O ENFERMERÍA, SERVICIO NO PBS, SERVICIO NO SOLICITADO, TRATAMIENTO INTEGRAL
TXT;

// 2026-09-23, pedido explícito del usuario viendo un correo real: "hay tres
// clientes... si la tutela vincula colmedica y aliansalud se debe hacer un
// registro por cada uno" — una misma tutela puede señalar a más de uno de
// los 3 clientes reales (Colmedica/Aliansalud/Unidad Médica), y en ese caso
// hace falta UN REGISTRO POR CADA CLIENTE, no uno solo con los 3 mezclados.
$instrucciones = "Eres un asistente que extrae datos de una tutela judicial colombiana recibida por correo electrónico, para un despacho de abogados. " .
    "Lee el asunto, el cuerpo del correo y los documentos adjuntos (pueden ser PDF o imágenes escaneadas de la tutela). " .
    "Esta tutela puede señalar/vincular a MÁS DE UNO de los 3 clientes reales del despacho (COLMEDICA MEDICINA PREPAGADA S.A., ALIANSALUD ENTIDAD PROMOTORA DE SALUD S.A., UNIDAD MÉDICA Y DE DIAGNÓSTICO S.A.) al mismo tiempo — en ese caso arma UN REGISTRO POR CADA CLIENTE señalado (mismos datos generales de la tutela, cambiando solo el campo Cliente en cada uno), en vez de un solo registro mezclado. Si solo aplica a un cliente, devuelve un solo registro igual. " .
    "Para el campo Tema, razona como lo haría un abogado especialista en tutelas de salud: analiza de fondo qué es lo que realmente está pidiendo/reclamando el accionante (no solo busques palabras clave sueltas) y elige la categoría que mejor describa ese fondo del asunto, apoyándote en esta lista de categorías ya usadas por el despacho como referencia (puede que la real no esté exactamente aquí — en ese caso, usa la más parecida en significado, con tus propias palabras si hace falta):\n{$temasReferencia}\n\n" .
    "Devuelve SOLO un objeto JSON (sin texto adicional antes o después, sin bloques de markdown) con esta forma exacta: {\"registros\": [ {...un registro...}, {...otro registro si aplica...} ]}. Cada registro debe tener EXACTAMENTE estas claves, dejando \"\" (cadena vacía) en lo que no puedas determinar con certeza — nunca inventes un dato que no esté en el correo:\n\n" . $camposEsperados;

$contenido = [];
$textoCorreo = "Asunto del correo: {$asunto}\n\nCuerpo del correo:\n{$cuerpo}";
$contenido[] = ['type' => 'text', 'text' => $textoCorreo];

// Excel NO se manda (Claude no lo puede leer visualmente como un PDF/imagen)
// — se ignora por ahora; si el correo trae la tutela en un Excel adjunto en
// vez de PDF/imagen, hay que extraerla a mano. Ver nota en el proyecto.
foreach($adjuntos as $adj){
    $tipo = (string)($adj['tipo'] ?? '');
    $base64 = (string)($adj['base64'] ?? '');
    if(!$base64) continue;
    if(strpos($tipo, 'image/') === 0){
        $contenido[] = ['type' => 'image', 'source' => ['type' => 'base64', 'media_type' => $tipo, 'data' => $base64]];
    } elseif($tipo === 'application/pdf'){
        $contenido[] = ['type' => 'document', 'source' => ['type' => 'base64', 'media_type' => $tipo, 'data' => $base64]];
    }
}

$body = [
    'model' => 'claude-sonnet-5',
    // Subido de 1500 a 4000 (2026-09-23, bug real: "Claude no devolvió un
    // JSON válido con registros" — con varios registros por cliente + el
    // campo Tema nuevo, la respuesta se quedaba corta y el JSON llegaba
    // incompleto/cortado a la mitad).
    'max_tokens' => 4000,
    'system' => $instrucciones,
    'messages' => [
        ['role' => 'user', 'content' => $contenido],
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
curl_setopt($ch, CURLOPT_TIMEOUT, 90);
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

// Claude a veces envuelve el JSON en ```json ... ``` aunque se le pida que
// no lo haga — se le quita esa envoltura si aparece, antes de decodificar.
$texto = trim($texto);
$texto = preg_replace('/^```(json)?/i', '', $texto);
$texto = preg_replace('/```$/', '', $texto);
$texto = trim($texto);

$data2 = json_decode($texto, true);
$registros = is_array($data2) ? ($data2['registros'] ?? null) : null;
if(!is_array($registros) || count($registros) === 0){
    http_response_code(502);
    echo json_encode(['error' => 'Claude no devolvió un JSON válido con "registros".', 'crudo' => $texto]);
    exit;
}

echo json_encode(['registros' => $registros]);
