<?php
// "Escrito con LexIA" desde el portal (Plan A) — 2026-10-13, pedido del usuario: el portal debe hacer lo mismo que el artefacto Plan B
// (elegir el modelo del despacho y redactar la contestación u otro escrito de la tutela) pensando siempre en gastar los menos créditos posibles.
//
// Cómo se ahorra (a diferencia de reescribir el modelo completo):
//   1. El portal baja el .docx del modelo, lista sus párrafos y le manda a Claude SOLO el texto (los párrafos muy largos, abreviados).
//      Claude devuelve únicamente los CAMBIOS (párrafos que cambian, que se eliminan o que se agregan, y reemplazos puntuales). Así la salida —lo más
//      caro— es una fracción del escrito, y el portal aplica los cambios sobre el propio archivo del modelo (conserva logo, formato y tablas).
//   2. Las instrucciones (criterios de LexIA) y el caso (lectura de la tutela) van en bloques con caché: las correcciones siguientes los pagan a
//      una fracción del precio.
//   3. Elegir el modelo es una llamada mínima con el modelo más barato (solo nombres de archivos).
//
// Modos: "elegir" (un modelo de una lista), "redactar" (cambios sobre los párrafos del modelo) y "corregir" (cambios sobre el borrador actual
// según una corrección del abogado; puede proponer una lección). No guarda ni envía nada.
//
// Va junto a los otros robots en public_html/robot-tutelas/ y usa config.php (clave de la API) y lexia-especialista.php.

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

@set_time_limit(190);
@ini_set('memory_limit', '256M');

function fallar($codigo, $mensaje){
    http_response_code($codigo);
    echo json_encode(['error' => $mensaje], JSON_UNESCAPED_UNICODE);
    exit;
}

require_once __DIR__ . '/lexia-especialista.php';
$configPath = __DIR__ . '/config.php';
if(!file_exists($configPath)) fallar(500, 'Falta config.php en el servidor.');
$config = require $configPath;
$apiKey = $config['anthropic_api_key'] ?? '';
if(!$apiKey || $apiKey === 'PEGA_AQUI_TU_CLAVE_REAL') fallar(500, 'El robot todavía no tiene configurada la clave real de la API de Claude en config.php.');
// Modelos (se pueden cambiar en config.php sin tocar este archivo): el barato elige el modelo del despacho; el principal redacta.
$modeloBarato = $config['modelo_barato'] ?? 'claude-haiku-5-5';
$modeloRedactar = $config['modelo_redactar'] ?? 'claude-sonnet-5';

$entrada = json_decode(file_get_contents('php://input'), true);
if(!is_array($entrada)) fallar(400, 'Solicitud inválida (no llegó un JSON válido).');
$modo = (string)($entrada['modo'] ?? '');

// Llama a la API con reintentos para errores pasajeros. Devuelve [datos, codigoHttp, errorCurl].
function llamarClaude($apiKey, $cuerpo){
    $json = json_encode($cuerpo, JSON_UNESCAPED_UNICODE);
    $respuesta = ''; $codigoHttp = 0; $errorCurl = '';
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
        curl_setopt($ch, CURLOPT_TIMEOUT, 170);
        $respuesta = curl_exec($ch);
        $codigoHttp = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $errorCurl = curl_error($ch);
        curl_close($ch);
        $pasajero = !$errorCurl && ($codigoHttp === 429 || $codigoHttp === 529 || $codigoHttp >= 500);
        if(!$pasajero || $intento === 3) break;
        sleep(3 * $intento);
    }
    return [json_decode($respuesta, true), $codigoHttp, $errorCurl, $respuesta];
}

// Llama con el modelo pedido; si la API dice que ese modelo no existe, reintenta con el de respaldo.
function llamarConRespaldo($apiKey, $cuerpo, $respaldo){
    list($data, $codigo, $errorCurl, $crudo) = llamarClaude($apiKey, $cuerpo);
    if($codigo === 404 || ($codigo === 400 && stripos((string)($data['error']['message'] ?? ''), 'model') !== false)){
        if($respaldo && $respaldo !== $cuerpo['model']){
            $cuerpo['model'] = $respaldo;
            list($data, $codigo, $errorCurl, $crudo) = llamarClaude($apiKey, $cuerpo);
        }
    }
    if($errorCurl) fallar(502, 'No se pudo conectar con la API de Claude: ' . $errorCurl);
    if($codigo !== 200){
        $detalle = $data['error']['message'] ?? $crudo;
        fallar(502, "Error de la API de Claude (código {$codigo}): {$detalle}");
    }
    return [$data, $cuerpo['model']];
}

function textoDe($data){
    $t = '';
    foreach(($data['content'] ?? []) as $b){ if(($b['type'] ?? '') === 'text') $t .= $b['text']; }
    return trim($t);
}
function objetoJsonDe($texto){
    $ini = strpos($texto, '{'); $fin = strrpos($texto, '}');
    $c = ($ini !== false && $fin !== false && $fin > $ini) ? substr($texto, $ini, $fin - $ini + 1) : $texto;
    $o = json_decode($c, true);
    return is_array($o) ? $o : null;
}
function usoDe($data, $modelo){
    $u = $data['usage'] ?? [];
    return [
        'modelo' => $modelo,
        'entrada' => (int)($u['input_tokens'] ?? 0),
        'salida' => (int)($u['output_tokens'] ?? 0),
        'cacheEscrito' => (int)($u['cache_creation_input_tokens'] ?? 0),
        'cacheLeido' => (int)($u['cache_read_input_tokens'] ?? 0),
    ];
}
function numeros($lista){
    $s = [];
    foreach((is_array($lista) ? $lista : []) as $x){ if(is_numeric($x)) $s[] = (int)$x; }
    return array_values(array_unique($s));
}
// Lista numerada de párrafos que manda el portal: [{n, t, largo, total}]
function listarParrafos($parrafos){
    $l = [];
    foreach((is_array($parrafos) ? $parrafos : []) as $p){
        if(!is_array($p) || !isset($p['n'])) continue;
        $t = trim((string)($p['t'] ?? ''));
        $marca = !empty($p['largo']) ? ' (…párrafo largo de ' . (int)($p['total'] ?? 0) . ' caracteres, abreviado: solo puedes dejarlo igual, eliminarlo o usar "reemplazos")' : '';
        $l[] = '[' . (int)$p['n'] . '] ' . $t . $marca;
    }
    return implode("\n", $l);
}

// ---------------------------------------------------------------- elegir
if($modo === 'elegir'){
    $caso = $entrada['caso'] ?? [];
    $modelos = array_slice(array_values(array_map('strval', is_array($entrada['modelos'] ?? null) ? $entrada['modelos'] : [])), 0, 300);
    if(!$modelos) fallar(400, 'No llegó la lista de modelos.');
    $lista = [];
    foreach($modelos as $i => $m) $lista[] = $i . ': ' . $m;
    $sistema = "Eres LexIA, abogada del despacho \"md abogados sas\" (defiende a ALIANSALUD EPS, COLMÉDICA MEDICINA PREPAGADA y UNIDAD MÉDICA Y DE DIAGNÓSTICO). Te doy el caso de una tutela y la lista numerada de modelos de escritos del despacho. Elige el UN modelo que mejor se adecua para redactar el escrito que se necesita (campo escritoNecesario), pensando en el Tema, la pretensión real, el cliente y los antecedentes (negativa por INVIMA/UNIRS, puerta de entrada, preexistencia, etc.), y teniendo en cuenta la nota del abogado. Para Colmédica prefiere los modelos del MISMO plan de medicina prepagada del usuario cuando existan. Devuelve SOLO JSON: {\"indice\":0,\"motivo\":\"una frase de por qué encaja\"}. Usa solo un índice de la lista.";
    $cuerpo = [
        'model' => $modeloBarato,
        'max_tokens' => 400,
        'system' => $sistema,
        'messages' => [['role' => 'user', 'content' => "CASO:\n" . json_encode($caso, JSON_UNESCAPED_UNICODE) . "\n\nMODELOS:\n" . implode("\n", $lista)]],
    ];
    list($data, $usado) = llamarConRespaldo($apiKey, $cuerpo, $modeloRedactar);
    $o = objetoJsonDe(textoDe($data));
    if(!$o || !isset($o['indice']) || !is_numeric($o['indice']) || !isset($modelos[(int)$o['indice']])) fallar(502, 'LexIA no pudo elegir un modelo de la lista.');
    echo json_encode(['indice' => (int)$o['indice'], 'motivo' => trim((string)($o['motivo'] ?? '')), 'uso' => usoDe($data, $usado)], JSON_UNESCAPED_UNICODE);
    exit;
}

if($modo !== 'redactar' && $modo !== 'corregir') fallar(400, 'Modo desconocido (usa elegir, redactar o corregir).');

// ---------------------------------------------------------------- redactar / corregir
$caso = trim((string)($entrada['caso'] ?? ''));
if($caso === '') fallar(400, 'No llegó la lectura de la tutela.');
$tipoEscrito = trim((string)($entrada['tipoEscrito'] ?? 'Contestación de la tutela'));
$hoy = trim((string)($entrada['hoy'] ?? date('Y-m-d')));
$nota = trim((string)($entrada['nota'] ?? ''));
$lecciones = trim((string)($entrada['lecciones'] ?? ''));
$otrosCorreos = trim((string)($entrada['correos'] ?? ''));
$clausulas = trim((string)($entrada['clausulas'] ?? ''));
$parrafos = listarParrafos($entrada['parrafos'] ?? []);
if($parrafos === '') fallar(400, 'No llegaron los párrafos del documento.');

$instrucciones = <<<'TXT'
TAREA: eres LexIA, abogada del despacho "md abogados sas". Vas a adaptar a UNA tutela un escrito (contestación, aclaración, impugnación, alcance, etc.) a partir de un MODELO del despacho, o a corregir un borrador. El portal te da el documento como una lista de párrafos numerados entre corchetes, [0], [1], [2]... y el caso en el bloque de datos. NO reescribas el documento: devuelve SOLO los CAMBIOS, porque el portal los aplica sobre el archivo Word original (con su logo, formato y tablas).

REGLAS:
(1) Conserva la estructura, los argumentos jurídicos y las citas de normas y jurisprudencia del modelo tal cual: NO inventes normas, artículos ni sentencias, ni cambies sus números.
(2) Cambia SOLO los datos del caso (radicado, juzgado y su correo, accionante, cédula, diagnóstico, servicio o medicamento, fechas, estado de afiliación, entidad accionada) por los de la lectura; si el modelo trata otro servicio o medicamento, ajústalo al del caso. El encabezado lleva: código de la tutela con la letra T- y el número, ciudad y fecha de hoy, juzgado y su correo, REF, RAD (número del proceso), ACCIONANTE, ACCIONADA.
(3) Usa las respuestas de las áreas y los demás correos de la tutela como fuente de los hechos y de las pruebas ya recibidas, cuando existan.
(4) Elimina (lista "eliminar") los párrafos que no apliquen a este caso y NO agregues hechos que la lectura no traiga.
(5) Donde falte un dato escribe [COMPLETAR: qué dato].
(6) Español jurídico formal, mismo tono del modelo, sin markdown. Cada párrafo nuevo o cambiado va como TEXTO PLANO completo de ese párrafo.
(7) Los párrafos marcados como abreviados (muy largos) casi siempre son citas o argumentos que no cambian: déjalos igual (no los menciones), elimínalos si no aplican, o cambia un dato puntual con "reemplazos" {"p":N,"buscar":"texto exacto y corto que aparece en el párrafo","reemplazar":"texto nuevo"}.
(8) Si un párrafo está vacío o es un título que sigue sirviendo, déjalo igual (no lo menciones). Solo aparece en tu respuesta lo que cambia.
(9) Si una corrección del abogado o una lección del despacho contradicen al modelo, mandan ellas.

Devuelve SOLO un objeto JSON, sin markdown, con esta forma exacta:
{"cambios":[{"p":0,"texto":"párrafo completo ya adaptado"}],"reemplazos":[{"p":12,"buscar":"...","reemplazar":"..."}],"eliminar":[7,8],"agregar":[{"despues":20,"textos":["párrafo nuevo 1","párrafo nuevo 2"]}],"alertas":"lista breve (una línea por punto, con guion) de lo que el abogado debe saber o verificar ANTES de firmar: términos urgentes o riesgo de desacato, datos que faltan, normas o sentencias a verificar, si el cliente probablemente tiene la razón y la salida prudente, y qué soportes conviene aportar. NO va dentro del escrito.","leccion":null}
En modo corrección, "leccion" puede ser {"general":true,"regla":"una regla breve en imperativo, reutilizable y sin datos de este caso","alcance":"todos|tipo|cliente"} si la corrección expresa un criterio general; si es propia de este caso, null.
TXT;

$sistema = [
    // Instrucciones + criterios de LexIA: iguales en todas las tutelas → caché.
    ['type' => 'text', 'text' => lexiaEspecialista() . "\n\n" . $instrucciones, 'cache_control' => ['type' => 'ephemeral']],
    // La lectura de ESTA tutela: igual en la redacción y en cada corrección → caché.
    ['type' => 'text', 'text' => "LECTURA DE LA TUTELA (datos del portal, del correo, de los anexos, solicitud de pruebas y respuestas de las áreas):\n" . $caso, 'cache_control' => ['type' => 'ephemeral']],
];

$usuario = ($modo === 'redactar' ? 'MODO: REDACTAR sobre un modelo del despacho.' : 'MODO: CORREGIR el borrador actual según la corrección del abogado.') .
    "\nESCRITO: " . $tipoEscrito .
    "\nFECHA DE HOY: " . $hoy;
if($nota !== '') $usuario .= "\n\nACTUACIÓN DEL JUEZ O PETICIÓN QUE SE RESPONDE / NOTA DEL ABOGADO:\n" . $nota;
if($modo === 'corregir'){
    $corr = trim((string)($entrada['instruccion'] ?? ''));
    if($corr === '') fallar(400, 'No llegó la corrección.');
    $usuario .= "\n\nCORRECCIÓN DEL ABOGADO:\n" . $corr;
}
if($lecciones !== '') $usuario .= "\n\nLECCIONES DEL DESPACHO (correcciones anteriores del abogado; aplícalas siempre):\n" . $lecciones;
if($otrosCorreos !== '') $usuario .= "\n\nOTROS CORREOS DE LA TUTELA (resumen; tenlos en cuenta como hechos y pruebas ya recibidas):\n" . $otrosCorreos;
if($clausulas !== '') $usuario .= "\n\nCLÁUSULAS DEL PLAN DE MEDICINA PREPAGADA (úsalas para fundamentar cobertura o exclusión citando el número de cláusula tal como aparece):\n" . $clausulas;
$usuario .= "\n\n" . ($modo === 'redactar' ? 'PÁRRAFOS DEL MODELO (numerados):' : 'PÁRRAFOS DEL BORRADOR ACTUAL (numerados):') . "\n" . $parrafos;

$cuerpo = [
    'model' => $modeloRedactar,
    'max_tokens' => 12000,
    'system' => $sistema,
    'messages' => [['role' => 'user', 'content' => $usuario]],
];
list($data, $usado) = llamarConRespaldo($apiKey, $cuerpo, null);
$texto = textoDe($data);
$o = objetoJsonDe($texto);
if(!$o){
    $stop = (string)($data['stop_reason'] ?? '');
    $vista = trim(preg_replace('/\s+/u', ' ', function_exists('mb_substr') ? mb_substr($texto, 0, 240) : substr($texto, 0, 240)));
    fallar(502, 'No se pudo leer la respuesta de LexIA' . ($stop === 'max_tokens' ? ' (quedó cortada por ser muy larga)' : '') . ($vista !== '' ? ': ' . $vista : '.'));
}
$cambios = [];
foreach((is_array($o['cambios'] ?? null) ? $o['cambios'] : []) as $c){
    if(is_array($c) && isset($c['p']) && is_numeric($c['p']) && isset($c['texto'])) $cambios[] = ['p' => (int)$c['p'], 'texto' => (string)$c['texto']];
}
$reemplazos = [];
foreach((is_array($o['reemplazos'] ?? null) ? $o['reemplazos'] : []) as $c){
    if(is_array($c) && isset($c['p']) && is_numeric($c['p']) && isset($c['buscar']) && (string)$c['buscar'] !== '' && isset($c['reemplazar'])){
        $reemplazos[] = ['p' => (int)$c['p'], 'buscar' => (string)$c['buscar'], 'reemplazar' => (string)$c['reemplazar']];
    }
}
$agregar = [];
foreach((is_array($o['agregar'] ?? null) ? $o['agregar'] : []) as $c){
    if(is_array($c) && isset($c['despues']) && is_numeric($c['despues']) && is_array($c['textos'] ?? null)){
        $agregar[] = ['despues' => (int)$c['despues'], 'textos' => array_values(array_map('strval', $c['textos']))];
    }
}
$leccion = null;
if(is_array($o['leccion'] ?? null) && !empty($o['leccion']['general']) && trim((string)($o['leccion']['regla'] ?? '')) !== ''){
    $al = (string)($o['leccion']['alcance'] ?? 'todos');
    $leccion = ['regla' => trim((string)$o['leccion']['regla']), 'alcance' => in_array($al, ['todos', 'tipo', 'cliente'], true) ? $al : 'todos'];
}
echo json_encode([
    'cambios' => $cambios, 'reemplazos' => $reemplazos, 'eliminar' => numeros($o['eliminar'] ?? []), 'agregar' => $agregar,
    'alertas' => trim((string)($o['alertas'] ?? '')), 'leccion' => $leccion, 'uso' => usoDe($data, $usado),
], JSON_UNESCAPED_UNICODE);
