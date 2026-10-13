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
    if(!headers_sent()) http_response_code($codigo);
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

// Llamada en streaming con «latido»: mientras Claude escribe, se manda un espacio cada pocos segundos para mantener viva la conexión.
function llamarClaudeStream($apiKey, $cuerpo){
    $cuerpo['stream'] = true;
    $json = json_encode($cuerpo, JSON_UNESCAPED_UNICODE);
    @ini_set('zlib.output_compression', '0');
    while(ob_get_level() > 0){ @ob_end_flush(); }
    if(!headers_sent()) header('X-Accel-Buffering: no');
    $latido = function(){ echo ' '; @ob_flush(); @flush(); };
    $latido();
    $texto = ''; $uso = []; $stop = ''; $errorEvento = ''; $crudo = ''; $codigoHttp = 0; $errorCurl = '';
    for($intento = 1; $intento <= 3; $intento++){
        $texto = ''; $uso = []; $stop = ''; $errorEvento = ''; $crudo = ''; $codigoHttp = 0; $buffer = ''; $ultimo = time();
        $ch = curl_init('https://api.anthropic.com/v1/messages');
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['content-type: application/json', 'x-api-key: ' . $apiKey, 'anthropic-version: 2023-06-01']);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $json);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 15);
        curl_setopt($ch, CURLOPT_TIMEOUT, 175);
        curl_setopt($ch, CURLOPT_HEADERFUNCTION, function($c, $h) use (&$codigoHttp){
            if(preg_match('#^HTTP/[0-9.]+ +([0-9]+)#', $h, $m)) $codigoHttp = (int)$m[1];
            return strlen($h);
        });
        curl_setopt($ch, CURLOPT_WRITEFUNCTION, function($c, $trozo) use (&$buffer, &$texto, &$uso, &$stop, &$errorEvento, &$crudo, &$codigoHttp, &$ultimo, $latido){
            if($codigoHttp !== 200){ $crudo .= $trozo; return strlen($trozo); }
            $buffer .= $trozo;
            while(($pos = strpos($buffer, "\n")) !== false){
                $linea = rtrim(substr($buffer, 0, $pos), "\r");
                $buffer = substr($buffer, $pos + 1);
                if(strpos($linea, 'data:') !== 0) continue;
                $ev = json_decode(trim(substr($linea, 5)), true);
                if(!is_array($ev)) continue;
                $tipo = $ev['type'] ?? '';
                if($tipo === 'content_block_delta' && (($ev['delta']['type'] ?? '') === 'text_delta')) $texto .= (string)($ev['delta']['text'] ?? '');
                elseif($tipo === 'message_start') $uso = array_merge($uso, is_array($ev['message']['usage'] ?? null) ? $ev['message']['usage'] : []);
                elseif($tipo === 'message_delta'){ $uso = array_merge($uso, is_array($ev['usage'] ?? null) ? $ev['usage'] : []); $stop = (string)($ev['delta']['stop_reason'] ?? $stop); }
                elseif($tipo === 'error') $errorEvento = (string)($ev['error']['message'] ?? 'error de la API');
            }
            if(time() - $ultimo >= 5){ $latido(); $ultimo = time(); }
            return strlen($trozo);
        });
        curl_exec($ch);
        $errorCurl = curl_error($ch);
        curl_close($ch);
        $pasajero = !$errorCurl && ($codigoHttp === 429 || $codigoHttp === 529 || $codigoHttp >= 500);
        if(!$pasajero || $intento === 3) break;
        for($k = 0; $k < 3 * $intento; $k++){ sleep(1); $latido(); }
    }
    if($errorCurl) return [null, 0, $errorCurl, ''];
    if($codigoHttp !== 200) return [json_decode($crudo, true), $codigoHttp, '', $crudo];
    if($errorEvento !== '') return [['error' => ['message' => $errorEvento]], 500, '', $errorEvento];
    return [['content' => [['type' => 'text', 'text' => $texto]], 'usage' => $uso, 'stop_reason' => $stop], 200, '', ''];
}
// Llama con el modelo pedido; si la API dice que ese modelo no existe, reintenta con el de respaldo.
function llamarConRespaldo($apiKey, $cuerpo, $respaldo, $largo = false){
    list($data, $codigo, $errorCurl, $crudo) = $largo ? llamarClaudeStream($apiKey, $cuerpo) : llamarClaude($apiKey, $cuerpo);
    if($codigo === 404 || ($codigo === 400 && stripos((string)($data['error']['message'] ?? ''), 'model') !== false)){
        if($respaldo && $respaldo !== $cuerpo['model']){
            $cuerpo['model'] = $respaldo;
            list($data, $codigo, $errorCurl, $crudo) = $largo ? llamarClaudeStream($apiKey, $cuerpo) : llamarClaude($apiKey, $cuerpo);
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
    // Intenta con el modelo barato; si su respuesta no trae un índice válido, reintenta UNA vez con el modelo principal.
    $intentos = [$modeloBarato, $modeloRedactar];
    $indice = null; $motivo = ''; $uso = null; $ultimoTexto = ''; $ultimoStop = '';
    foreach($intentos as $k => $modeloIntento){
        if($k === 1 && $modeloIntento === $modeloBarato) break;
        $cuerpo['model'] = $modeloIntento;
        list($data, $usado) = llamarConRespaldo($apiKey, $cuerpo, $modeloRedactar);
        $texto = textoDe($data);
        $ultimoTexto = $texto; $ultimoStop = (string)($data['stop_reason'] ?? '');
        $o = objetoJsonDe($texto);
        $cand = ($o && isset($o['indice']) && is_numeric($o['indice'])) ? (int)$o['indice'] : null;
        // Tolerancia: «indice: 12» o un número suelto, aunque no venga como JSON válido.
        if($cand === null && preg_match('/"?indice"?\s*[:=]\s*(\d+)/iu', $texto, $mm)) $cand = (int)$mm[1];
        if($cand === null && preg_match('/^\s*(\d+)\b/', $texto, $mm)) $cand = (int)$mm[1];
        if($cand !== null && isset($modelos[$cand])){
            $indice = $cand; $motivo = trim((string)($o['motivo'] ?? '')); $uso = usoDe($data, $usado);
            break;
        }
    }
    if($indice === null){
        $vista = trim(preg_replace('/\s+/u', ' ', function_exists('mb_substr') ? mb_substr($ultimoTexto, 0, 200) : substr($ultimoTexto, 0, 200)));
        fallar(502, 'LexIA no pudo elegir un modelo de la lista' . ($ultimoStop === 'max_tokens' ? ' (respuesta cortada)' : '') . ($vista !== '' ? ': respondió «' . $vista . '»' : ' (la respuesta llegó vacía).') . ' Usa la lista de modelos y elige uno a mano.');
    }
    echo json_encode(['indice' => $indice, 'motivo' => $motivo, 'uso' => $uso], JSON_UNESCAPED_UNICODE);
    exit;
}

// ---------------------------------------------------------------- fichas
// Una ficha corta por modelo (tema, cliente/plan, argumento principal) para elegir mejor que solo por el nombre del archivo. Se pide UNA vez por
// modelo (con el modelo barato) y el portal la guarda en la lista de modelos; elegir después no cuesta más.
if($modo === 'fichas'){
    $lista = [];
    foreach(array_slice(is_array($entrada['modelos'] ?? null) ? $entrada['modelos'] : [], 0, 12) as $m){
        if(!is_array($m) || !isset($m['i'])) continue;
        $lista[] = '### MODELO ' . (int)$m['i'] . ' — ' . trim((string)($m['ruta'] ?? '')) . "\n" . mb_substr(trim((string)($m['texto'] ?? '')), 0, 2000);
    }
    if(!$lista) fallar(400, 'No llegaron modelos para describir.');
    $sistema = "Eres LexIA, abogada del despacho \"md abogados sas\". Te doy el comienzo y los títulos de varios MODELOS de escritos de tutela del despacho. Para CADA modelo escribe una ficha de máximo 35 palabras que diga: qué tema o servicio trata (por ejemplo preexistencia, exclusión de medicamento, agendamiento, tratamiento integral), a qué cliente o plan de medicina prepagada va dirigido si se nota, y cuál es su argumento de defensa principal. No inventes: si algo no se ve, no lo digas. Devuelve SOLO JSON: {\"fichas\":[{\"i\":0,\"ficha\":\"...\"}]} usando los mismos números i que te doy.";
    $cuerpo = ['model' => $modeloBarato, 'max_tokens' => 2500, 'system' => $sistema, 'messages' => [['role' => 'user', 'content' => implode("\n\n", $lista)]]];
    // Intenta con el modelo barato; si no trae fichas válidas, reintenta UNA vez con el modelo principal. Si el JSON viene mal formado, se
    // recuperan las fichas una por una con una expresión regular.
    $fichas = []; $ultimoTexto = ''; $uso = null;
    foreach([$modeloBarato, $modeloRedactar] as $k => $modeloIntento){
        if($k === 1 && $modeloIntento === $modeloBarato) break;
        $cuerpo['model'] = $modeloIntento;
        $cuerpo['max_tokens'] = $k === 0 ? 3000 : 4000;
        list($data, $usado) = llamarConRespaldo($apiKey, $cuerpo, $modeloRedactar);
        $texto = textoDe($data);
        $ultimoTexto = $texto;
        $fichas = [];
        $o = objetoJsonDe($texto);
        foreach((is_array($o['fichas'] ?? null) ? $o['fichas'] : []) as $x){
            if(is_array($x) && isset($x['i']) && is_numeric($x['i']) && trim((string)($x['ficha'] ?? '')) !== '') $fichas[] = ['i' => (int)$x['i'], 'ficha' => trim((string)$x['ficha'])];
        }
        if(!$fichas && preg_match_all('/"i"\s*:\s*([0-9]+)\s*,\s*"ficha"\s*:\s*"((?:[^"\\\\]|\\\\.)*)"/su', $texto, $mm, PREG_SET_ORDER)){
            foreach($mm as $m){
                $f = json_decode('"' . $m[2] . '"');
                if(is_string($f) && trim($f) !== '') $fichas[] = ['i' => (int)$m[1], 'ficha' => trim($f)];
            }
        }
        $uso = usoDe($data, $usado);
        if($fichas) break;
    }
    if(!$fichas){
        $vista = trim(preg_replace('/\s+/u', ' ', function_exists('mb_substr') ? mb_substr($ultimoTexto, 0, 200) : substr($ultimoTexto, 0, 200)));
        fallar(502, 'LexIA no pudo describir los modelos (respuesta no válida)' . ($vista !== '' ? ': respondió «' . $vista . '»' : '.'));
    }
    echo json_encode(['fichas' => $fichas, 'uso' => $uso], JSON_UNESCAPED_UNICODE);
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
(3) LOS CORREOS DE LA TUTELA SON FUNDAMENTALES (bloque «TODOS LOS CORREOS DE LA TUTELA»): tómalos como fuente principal de los hechos posteriores a la tutela, de las pruebas y respuestas que ya llegaron de las áreas, y de las decisiones del juzgado (auto admisorio, medida provisional, nuevos términos, vinculaciones, fallo). Si un correo más reciente contradice la lectura inicial, manda el más reciente y dilo en «alertas». Usa lo que dicen las áreas (estado del paciente, autorizaciones, agendamientos, soportes) para redactar los hechos y la defensa; no repitas lo que ya esté superado.
(4) Elimina (lista "eliminar") los párrafos que no apliquen a este caso y NO agregues hechos que la lectura no traiga.
(5) Donde falte un dato escribe [COMPLETAR: qué dato].
(6) Español jurídico formal, mismo tono del modelo, sin markdown. Cada párrafo nuevo o cambiado va como TEXTO PLANO completo de ese párrafo.
(7) Los párrafos marcados como abreviados (muy largos) casi siempre son citas o argumentos que no cambian: déjalos igual (no los menciones), elimínalos si no aplican, o cambia un dato puntual con "reemplazos" {"p":N,"buscar":"texto exacto y corto que aparece en el párrafo","reemplazar":"texto nuevo"}.
(8) Si un párrafo está vacío o es un título que sigue sirviendo, déjalo igual (no lo menciones). Solo aparece en tu respuesta lo que cambia.
(8b) AHORRA SALIDA (la respuesta tiene un tope de tamaño): para cambiar un dato DENTRO de un párrafo (nombre, cédula, fecha, diagnóstico, plan, servicio) usa SIEMPRE «reemplazos» con textos exactos y cortos; usa «cambios» (párrafo completo) solo cuando reescribes casi todo el párrafo. Una misma frase repetida en varios párrafos se cambia con un reemplazo por párrafo. «alertas»: máximo 8 líneas cortas.
(9) Si una corrección del abogado o una lección del despacho contradicen al modelo, mandan ellas.

Devuelve SOLO un objeto JSON, sin markdown, con esta forma exacta:
{"cambios":[{"p":0,"texto":"párrafo completo ya adaptado"}],"reemplazos":[{"p":12,"buscar":"...","reemplazar":"..."}],"eliminar":[7,8],"agregar":[{"despues":20,"textos":["párrafo nuevo 1","párrafo nuevo 2"]}],"alertas":"lista breve (una línea por punto, con guion) de lo que el abogado debe saber o verificar ANTES de firmar: términos urgentes o riesgo de desacato, datos que faltan, normas o sentencias a verificar, si el cliente probablemente tiene la razón y la salida prudente, y qué soportes conviene aportar. NO va dentro del escrito.","leccion":null}
En modo corrección, "leccion" puede ser {"general":true,"regla":"una regla breve en imperativo, reutilizable y sin datos de este caso","alcance":"todos|tipo|cliente"} si la corrección expresa un criterio general; si es propia de este caso, null.
TXT;

$sistema = [
    // Instrucciones + criterios de LexIA: iguales en todas las tutelas → caché.
    ['type' => 'text', 'text' => lexiaEspecialista() . "\n\n" . $instrucciones, 'cache_control' => ['type' => 'ephemeral']],
    // La lectura de ESTA tutela: igual en la redacción y en cada corrección → caché.
    ['type' => 'text', 'text' => "LECTURA DE LA TUTELA (datos del portal, del correo, de los anexos, solicitud de pruebas y respuestas de las áreas):\n" . $caso . ($otrosCorreos !== '' ? "\n\n################ TODOS LOS CORREOS DE LA TUTELA (de cualquier remitente, del más antiguo al más reciente; son FUNDAMENTALES para contestar) ################\n" . $otrosCorreos : ''), 'cache_control' => ['type' => 'ephemeral']],
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
if($clausulas !== '') $usuario .= "\n\nCLÁUSULAS DEL PLAN DE MEDICINA PREPAGADA (úsalas para fundamentar cobertura o exclusión citando el número de cláusula tal como aparece):\n" . $clausulas;
$usuario .= "\n\n" . ($modo === 'redactar' ? 'PÁRRAFOS DEL MODELO (numerados):' : 'PÁRRAFOS DEL BORRADOR ACTUAL (numerados):') . "\n" . $parrafos;

$cuerpo = [
    'model' => $modeloRedactar,
    'max_tokens' => 16000,
    'system' => $sistema,
    'messages' => [['role' => 'user', 'content' => $usuario]],
];
list($data, $usado) = llamarConRespaldo($apiKey, $cuerpo, null, true);
$texto = textoDe($data);
$o = objetoJsonDe($texto);
// Si la respuesta quedó cortada (o con el JSON dañado) se recuperan los cambios COMPLETOS que alcanzaron a salir; lo demás se descarta.
if(!$o){
    $rec = ['cambios' => [], 'reemplazos' => [], 'eliminar' => []];
    if(preg_match_all('/{\s*"p"\s*:\s*([0-9]+)\s*,\s*"texto"\s*:\s*("(?:[^"\\\\]|\\\\.)*")\s*}/su', $texto, $mm, PREG_SET_ORDER)){
        foreach($mm as $m){ $t = json_decode($m[2]); if(is_string($t)) $rec['cambios'][] = ['p' => (int)$m[1], 'texto' => $t]; }
    }
    if(preg_match_all('/{\s*"p"\s*:\s*([0-9]+)\s*,\s*"buscar"\s*:\s*("(?:[^"\\\\]|\\\\.)*")\s*,\s*"reemplazar"\s*:\s*("(?:[^"\\\\]|\\\\.)*")\s*}/su', $texto, $mm, PREG_SET_ORDER)){
        foreach($mm as $m){ $b = json_decode($m[2]); $n = json_decode($m[3]); if(is_string($b) && is_string($n)) $rec['reemplazos'][] = ['p' => (int)$m[1], 'buscar' => $b, 'reemplazar' => $n]; }
    }
    if(preg_match('/"eliminar"\s*:\s*\[([0-9, ]*)\]/u', $texto, $mm)){ foreach(preg_split('/\s*,\s*/', trim($mm[1])) as $x){ if($x !== '' && is_numeric($x)) $rec['eliminar'][] = (int)$x; } }
    if($rec['cambios'] || $rec['reemplazos'] || $rec['eliminar']){
        $o = $rec + ['agregar' => [], 'alertas' => 'La respuesta de LexIA quedó cortada: se aplicaron los cambios completos que alcanzaron a salir; revisa el escrito con cuidado y, si falta algo, usa «Enséñame».'];
    }
}
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
