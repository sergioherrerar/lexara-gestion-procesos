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

@set_time_limit(190);
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
// Si la tutela señala a varios clientes llegan todos los registros: se arma UN solo correo para todos.
$registros = is_array($entrada['registros'] ?? null) ? array_values(array_filter($entrada['registros'], 'is_array')) : [];
if(!$registros && $registro) $registros = [$registro];
$asuntoCorreo = (string)($entrada['asuntoCorreo'] ?? '');
$vencimiento = (string)($entrada['fechaVencimiento'] ?? '');     // aaaa-mm-dd
$noTutela = (string)($entrada['noTutela'] ?? ($registro['NoTutela'] ?? ''));
// Entidades que la tutela SEÑALA (accionadas o vinculadas): una por cada cliente con registro. Solo a esas se les pide.
function entidadDeCliente($cliente){
    $c = strtolower((string)$cliente);
    if(strpos($c, 'aliansalud') !== false) return 'ALIANSALUD';
    if(strpos($c, 'colm') !== false) return 'COLMÉDICA';
    if(strpos($c, 'unidad') !== false) return 'UMD';
    return '';
}
$entidadesSenaladas = [];
foreach((is_array($entrada['clientesSenalados'] ?? null) ? $entrada['clientesSenalados'] : []) as $cli){
    $e = entidadDeCliente($cli);
    if($e !== '' && !in_array($e, $entidadesSenaladas, true)) $entidadesSenaladas[] = $e;
}
$propia = entidadDeCliente($registro['Cliente'] ?? '');
if($propia !== '' && !in_array($propia, $entidadesSenaladas, true)) $entidadesSenaladas[] = $propia;
foreach($registros as $rg){
    $e = entidadDeCliente($rg['Cliente'] ?? '');
    if($e !== '' && !in_array($e, $entidadesSenaladas, true)) $entidadesSenaladas[] = $e;
}
$ordenEntidades = ['ALIANSALUD', 'COLMÉDICA', 'UMD'];
usort($entidadesSenaladas, function($a, $b) use ($ordenEntidades){ return array_search($a, $ordenEntidades) <=> array_search($b, $ordenEntidades); });
// UMD no tiene áreas propias en la agenda: según el formato, su información se pide a las áreas de Colmédica (CMC) o de Aliansalud (IPS de asignación básica).
$entidadesParaCorreos = $entidadesSenaladas;
if(in_array('UMD', $entidadesSenaladas, true)){
    foreach(['COLMÉDICA', 'ALIANSALUD'] as $eu){ if(!in_array($eu, $entidadesParaCorreos, true)) $entidadesParaCorreos[] = $eu; }
}
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

// Urgencia (días calendario hasta el vencimiento) — se calcula acá, no se le deja adivinar al modelo.
$urgenciaTexto = '(sin fecha de vencimiento)';
$urgente = false;
if(preg_match('/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/', $vencimiento)){
    $diasParaVencer = (int)round((strtotime($vencimiento) - strtotime(date('Y-m-d'))) / 86400);
    if($diasParaVencer < 0){ $urgente = true; $urgenciaTexto = 'YA VENCIÓ hace ' . abs($diasParaVencer) . ' día(s) — URGENTE'; }
    elseif($diasParaVencer === 0){ $urgente = true; $urgenciaTexto = 'VENCE HOY — URGENTE'; }
    elseif($diasParaVencer === 1){ $urgente = true; $urgenciaTexto = 'vence MAÑANA — URGENTE'; }
    else { $urgenciaTexto = 'vence en ' . $diasParaVencer . ' días calendario (no urgente)'; }
}

$tarea = <<<'TXT'

TAREA ACTUAL: armar el CORREO DE SOLICITUD DE PRUEBAS de UNA tutela, usando el documento "FORMATO SOLICITUD DE PRUEBAS" del despacho que va más abajo (es la fuente oficial y vigente: su agenda de áreas/correos y sus formatos). Hazlo como lo haría la mejor abogada especialista del despacho: un correo claro, completo y accionable que permita a las áreas reunir en pocas horas exactamente lo que se necesita para contestar y probar la defensa. Reglas:
1. Elige el o los formatos del documento que correspondan a lo que realmente pide la tutela (usa Prestacion, Tema, Solicita y Analisis del registro). Si la tutela pide varias cosas, combina los bloques que apliquen sin duplicar instrucciones. Si ningún formato encaja del todo, usa el más cercano y agrega solo las solicitudes puntuales que la tutela exija.
2. Mantén la redacción y el orden de los bloques del formato (saludo, "Tutela que VENCE DÍA ...", "PRETENSIÓN: ...", áreas y sus viñetas). Reemplaza los marcadores por los datos reales: DD/MM/AA = la fecha de vencimiento que se te da (dd/mm/aaaa) y los puntos suspensivos o rayas por el diagnóstico, servicio, medicamento, especialidad o valor concretos de ESTA tutela. Ninguna fecha de ejemplo del documento (como "21/04/2025") puede quedar en el correo. Si un dato no está en el registro, deja el marcador en corchetes para que el abogado lo complete, por ejemplo [especialidad]. No inventes datos.
3. El portal ya pone ARRIBA de tu texto una tabla con los datos de la tutela (No. Tutela, Entidad, Cliente, vinculación, tipo de respuesta, medida cautelar, agencia oficiosa, usuario, identificación y tema): NO repitas esos datos ni escribas un bloque de datos del caso. Empieza directamente con el saludo del formato. Tampoco copies textos largos de la tutela: la PRETENSIÓN del formato basta, en una línea.
4. RELEVANCIA DE LAS ÁREAS (criterio de la abogada a cargo del despacho, 2026-10-07, tutelas 28246 y 28247): pide información SOLO a las áreas cuya información sirve para contestar lo que de verdad se discute en ESTA tutela; un correo con menos áreas y más precisas es mejor que uno con todas. En concreto: (a) Área médica de la entidad accionada o vinculada: siempre que se discutan servicios, medicamentos o atenciones de salud. (b) ENTIDADES: pide información SOLO a las entidades que la tutela señala (dato "Entidades que la tutela señala"). El área médica de COLMÉDICA solo va si COLMÉDICA figura entre esas entidades. Si la tutela solo señala a ALIANSALUD EPS, NO incluyas el bloque ni los correos de Colmédica ni de ninguna otra entidad — aunque el usuario tenga medicina prepagada o la orden la haya emitido un médico de Colmédica (instrucción del abogado, tutela 28246); si crees que convendría pedir también a otra entidad, dilo en "notas" para que el abogado la agregue. (c) Área de operaciones y/o afiliaciones: por defecto NO la incluyas. Solo va cuando el escrito de tutela cuestiona o depende de la afiliación — vigencia, mora o suspensión, retiro, traslado, IBC, grupo familiar, calidad de beneficiario, portabilidad o movilidad —, o el asunto es estabilidad laboral reforzada, copagos o cuotas moderadoras, reembolso, incapacidades o licencias. Si lo que se discute es entregar, autorizar o agendar un medicamento, procedimiento o servicio (aunque haya una negativa por criterios técnicos, INVIMA, no PBS o UNIRS) y nadie cuestiona la afiliación, NO incluyas ese bloque ni sus correos, aunque el formato lo traiga. ANTES DE ENTREGAR revisa uno por uno los bloques de área de tu correo y elimina todo bloque de operaciones y/o afiliaciones que no cumpla esa condición (instrucción del abogado a cargo, tutelas 28246 y 28248). (d) Prestaciones económicas, servicio al cliente y las demás áreas: solo si el asunto es de su competencia según la agenda del documento. En "notas" anota qué áreas omitiste por no ser relevantes y por qué.
4.1. UN SOLO CORREO CON VARIAS ENTIDADES: si la tutela señala a más de una entidad (Aliansalud, Colmédica y/o UMD), NO armes un correo por entidad: arma UN solo correo con los datos comunes una sola vez (saludo, "Tutela que VENCE DÍA ...", "PRETENSIÓN: ...") y después UNA SECCIÓN POR ENTIDAD, con el nombre de la entidad en mayúsculas como título terminado en dos puntos (por ejemplo "ALIANSALUD EPS:", "COLMÉDICA MEDICINA PREPAGADA:", "UNIDAD MÉDICA Y DE DIAGNÓSTICO (UMD):") y debajo, con el formato que corresponda a esa entidad, solo sus áreas relevantes con sus viñetas. UMD no tiene áreas propias en la agenda: según el documento, la información de UMD se pide a las áreas de Colmédica (si es un centro médico Colmédica) o de Aliansalud (si es la IPS de asignación básica de usuarios de Aliansalud) — escribe su sección dirigida a esas áreas, indicando que es para UMD. Los destinatarios ("para") son la unión de las áreas de todas las secciones.
5. Criterio de especialista sobre lo que se pide: cada soporte debe poder usarse para alegar hecho superado o probar la defensa, así que cuando el formato pida listados, autorizaciones, agendamientos, entregas o respuestas, pide que lleguen CON SUS FECHAS y constancias (de autorización, de agendamiento, de entrega, de envío al usuario). Revisa Analisis.PruebasPorReunir y Analisis.Defensas del registro: si hay soportes ahí que el formato no cubre y que están directamente ligados a los hechos de esta tutela, agrégalos como viñetas puntuales en el área que corresponda. No pidas lo que el accionante ya aportó en la tutela ni llenes el correo de solicitudes genéricas que no aportan a la defensa.
6. SIN ALERTAS EN EL CORREO (instrucción del abogado a cargo, 2026-10-09): el cuerpo del correo NO lleva alertas, advertencias ni recordatorios jurídicos — nada de líneas como "Alerta: ...", "URGENTE: ...", "MEDIDA PROVISIONAL ORDENADA: ...", ni frases sobre presunción de veracidad, desacato o que el juez pueda tener por ciertos los hechos. Del plazo solo va el término que ya trae el formato en la línea "Tutela que VENCE DÍA ..." con la fecha de vencimiento. Si hay una medida provisional, un término muy corto u otro riesgo, anótalo ÚNICAMENTE en "notas" (que no va en el correo) para el abogado.
7. Si TipoRespuesta no es TUTELA, adapta el pedido: CUMPLIMIENTO FALLO → soportes de cumplimiento de cada orden del fallo, con fechas y constancias; IMPUGNACION → hechos y soportes nuevos posteriores a la contestación y lo que el fallo ordenó; REQUERIMIENTO, ACLARACION, ALCANCE, MODULACION, NULIDAD, CORRECION, APLAZAMIENTO → pide solo la información puntual que ese trámite exige, tomándola de lo que pide el juzgado.
8. URGENCIA: no agregues líneas de urgencia al cuerpo. La urgencia se expresa solo con la fecha de la línea "Tutela que VENCE DÍA ..." y el "cuanto antes" que ya trae el formato; si el dato "Urgencia" indica que vence hoy, mañana o ya venció, menciónalo en "notas".
9. Destinatarios (para): los correos de la AGENDA del documento para las áreas a las que SÍ se les pide información en este correo — usa solo correos que aparezcan en la agenda, escritos exactamente igual, sin inventar ninguno. Si un área tiene un principal y suplentes, incluye todos los de esa área. Copia (cc): el área jurídica de la entidad (Dania Carolina Pachón), con el correo del dominio que corresponda al Cliente del registro (aliansalud.com.co, colmedica.com o umd.com.co), tal como esté en la agenda. Si no puedes determinar a quién enviar, deja "para" vacío y explícalo en "notas".
10. Cuerpo en TEXTO PLANO (sin markdown): una frase por línea, los títulos de área y de bloque terminados en dos puntos, las viñetas empezando con "- ". Tono cordial, profesional y directo. Termina con una línea de despedida breve ("Quedo atenta a su respuesta. Cordial saludo,"). No pongas firma ni datos de contacto: el abogado la agrega. El correo debe leerse en un minuto: sin repetir instrucciones ni explicaciones jurídicas largas.
11. Asunto: arma uno razonable ("TUTELA No. <NoTutela> - SOLICITUD DE PRUEBAS - VENCE <dd/mm/aaaa>"); el sistema lo ajusta si hace falta.
12. En "notas" (máximo 3 frases breves, para el abogado, NO va en el correo) anota: qué formato(s) usaste y por qué, qué datos quedaron pendientes entre corchetes, qué soportes extra agregaste por criterio propio, y cualquier alerta relevante (vencimiento muy cercano, medida provisional, o algo que el área jurídica deba revisar, como el aviso del formato sobre contraindicaciones).

Devuelve SOLO un objeto JSON (sin bloques de markdown ni texto adicional) con esta forma exacta:
{"para": ["correo1", "correo2"], "cc": ["correo"], "asunto": "...", "cuerpo": "...", "notas": "...", "pretensiones": ["...", "..."]}
"pretensiones": las 2 a 4 pretensiones MÁS IMPORTANTES de la tutela, cada una en una frase corta y concreta (por ejemplo "Autorización y entrega del medicamento X", "Tratamiento integral", "Agendamiento de cita con cardiología"), en orden de importancia, tomadas de lo que realmente pide el accionante (campos Solicita y Analisis.Pretensiones del registro). Van en el campo "Tema" de la tabla del correo. Que NO sean una categoría genérica.
TXT;

$instrucciones = "Eres LexIA, el asistente de inteligencia artificial del despacho de abogados \"md abogados sas\". Si en algún texto necesitas referirte a ti misma, usa SIEMPRE el nombre \"LexIA\".\n\n" . lexiaEspecialista() . "\n" . $tarea;

$documentoFormato = "DOCUMENTO \"FORMATO SOLICITUD DE PRUEBAS\" (texto vigente, tal como está hoy en SharePoint; las tablas vienen con las celdas separadas por \" | \"):\n\n" . $formato;

$datosTutela = "DATOS DE LA TUTELA (extraídos por LexIA del correo y los documentos):\n" .
    json_encode(count($registros) > 1 ? $registros : $registro, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) .
    (count($registros) > 1 ? "\n(Esta tutela señala a " . count($registros) . " clientes: los datos de arriba son un registro por cliente. Arma UN SOLO correo para todos, con una sección por entidad.)" : '') .
    "\n\nNo. de tutela: " . $noTutela .
    "\nAsunto del correo original: " . $asuntoCorreo .
    "\nFecha de vencimiento (aaaa-mm-dd): " . ($vencimiento !== '' ? $vencimiento : '(sin fecha — deja [fecha de vencimiento] para completar)') .
    ($vencimientoLegible !== '' ? "\nFecha de vencimiento (dd/mm/aaaa) para el correo: " . $vencimientoLegible : '') .
    "\nEntidades que la tutela señala (única fuente para decidir a qué entidades pedir información): " . ($entidadesSenaladas ? implode(', ', $entidadesSenaladas) : '(no se pudo determinar)') .
    "\nUrgencia: " . $urgenciaTexto .
    "\nFecha de hoy: " . date('Y-m-d');

$body = [
    'model' => 'claude-sonnet-5',
    'max_tokens' => 10000,
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
    curl_setopt($ch, CURLOPT_TIMEOUT, 170);
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

// Correos que de verdad aparecen en la agenda del documento (en minúsculas → como están escritos).
// Es la red de seguridad contra un correo inventado o mal copiado: solo se aceptan esos.
preg_match_all('/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+([.][A-Za-z0-9-]+)+/', $formato, $coincidencias);
$agenda = [];
foreach($coincidencias[0] as $c){
    $c = rtrim($c, '.');
    if(!isset($agenda[strtolower($c)])) $agenda[strtolower($c)] = $c;
}
function soloCorreosDeAgenda($lista, $agenda){
    $salida = [];
    foreach((is_array($lista) ? $lista : []) as $c){
        $clave = strtolower(trim((string)$c));
        if(isset($agenda[$clave]) && !in_array($agenda[$clave], $salida, true)) $salida[] = $agenda[$clave];
    }
    return $salida;
}
$para = soloCorreosDeAgenda($correo['para'] ?? [], $agenda);
$cc = soloCorreosDeAgenda($correo['cc'] ?? [], $agenda);
// Red de seguridad: solo correos de las entidades señaladas (o del área jurídica). La agenda del Word dice a qué entidad pertenece cada correo.
if($entidadesSenaladas){
    $entidadPorCorreo = [];
    $entidadActual = '';
    foreach(preg_split('/\r?\n/', $formato) as $lineaAgenda){
        $t = trim($lineaAgenda);
        if(preg_match('/^qu[eé] informaci[oó]n se le puede pedir/iu', $t)) break;
        if(preg_match('/^COLM[ÉE]DICA/iu', $t)){ $entidadActual = 'COLMÉDICA'; continue; }
        if(preg_match('/^ALIANSALUD/iu', $t)){ $entidadActual = 'ALIANSALUD'; continue; }
        if(preg_match('/^UNIDAD M[ÉE]DICA/iu', $t)){ $entidadActual = 'UMD'; continue; }
        if(preg_match('/^[ÁA]REA JUR[ÍI]DICA/iu', $t)){ $entidadActual = 'JURÍDICA'; continue; }
        if($entidadActual === '') continue;
        if(preg_match_all('/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+([.][A-Za-z0-9-]+)+/', $t, $mc)){
            foreach($mc[0] as $cm){ $entidadPorCorreo[strtolower(rtrim($cm, '.'))][$entidadActual] = true; }
        }
    }
    $permitido = function($correo) use ($entidadPorCorreo, $entidadesParaCorreos){
        $ents = $entidadPorCorreo[strtolower($correo)] ?? [];
        if(!$ents) return true; // no está clasificado en la agenda: no se toca
        foreach(array_keys($ents) as $e){ if($e === 'JURÍDICA' || in_array($e, $entidadesParaCorreos, true)) return true; }
        return false;
    };
    $paraAntes = $para;
    $para = array_values(array_filter($para, $permitido));
    $cc = array_values(array_filter($cc, $permitido));
    $quitados = array_values(array_diff($paraAntes, $para));
}

// Red de seguridad de afiliaciones: si el caso no habla de afiliación ni de los temas que dependen de ella, se quitan de "Para" los correos de las áreas de operaciones y/o afiliaciones.
$textoCaso = mb_strtolower(json_encode($registros ?: [$registro], JSON_UNESCAPED_UNICODE), 'UTF-8');
$afiliacionEnDiscusion = (bool)preg_match('/desafilia|vigencia|cotizaci|portabilidad|movilidad|estabilidad|copago|cuota moderadora|reembolso|incapacidad|licencia|protecci[oó]n laboral|\bibc\b|\bmora\b|afiliaci[oó]n (suspendida|cancelada|retirada|terminada|inactiva)|problemas? (de|con) (la )?afiliaci|no (est[aá]|se encuentra) afiliad/u', $textoCaso);
if(!$afiliacionEnDiscusion){
    $areaPorCorreo = [];
    foreach(preg_split('/\r?\n/', $formato) as $lineaAg){
        $t2 = trim($lineaAg);
        if(preg_match('/^qu[eé] informaci[oó]n se le puede pedir/iu', $t2)) break;
        $primera = trim(explode(' | ', $t2)[0]);
        if(!preg_match('/^[ÁA]rea/iu', $primera) || !preg_match('/operaciones|afiliaciones/iu', $primera)) continue;
        if(preg_match_all('/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+([.][A-Za-z0-9-]+)+/', $t2, $mc2)){ foreach($mc2[0] as $cm2){ $areaPorCorreo[strtolower(rtrim($cm2, '.'))] = true; } }
    }
    if($areaPorCorreo){
        $paraAntes2 = $para;
        $para = array_values(array_filter($para, function($c) use ($areaPorCorreo){ return !isset($areaPorCorreo[strtolower($c)]); }));
        $quitadosAfiliaciones = array_values(array_diff($paraAntes2, $para));
    }
}

// Copia obligatoria al área jurídica de la entidad (Dania Carolina Pachón) según el Cliente.
$clienteTxt = strtolower((string)($registro['Cliente'] ?? ''));
$dominioJuridica = '';
$nombreCorto = '';
$dominiosJuridica = ['ALIANSALUD' => 'aliansalud.com.co', 'COLMÉDICA' => 'colmedica.com', 'UMD' => 'umd.com.co'];
$principal = $entidadesSenaladas ? $entidadesSenaladas[0] : entidadDeCliente($registro['Cliente'] ?? '');
if($principal !== '' && isset($dominiosJuridica[$principal])) $dominioJuridica = $dominiosJuridica[$principal];
$nombreCorto = $entidadesSenaladas ? implode(' / ', $entidadesSenaladas) : $principal;
if($dominioJuridica !== ''){
    $clave = 'daniacp@' . $dominioJuridica;
    if(isset($agenda[$clave]) && !in_array($agenda[$clave], $cc, true) && !in_array($agenda[$clave], $para, true)) $cc[] = $agenda[$clave];
}

// Asunto estándar armado acá (no depende de lo que escriba el modelo); URGENTE si vence hoy, mañana o ya venció.
$asuntoFinal = trim((string)($correo['asunto'] ?? ''));
if($noTutela !== ''){
    $asuntoFinal = ($urgente ? 'URGENTE - ' : '') . 'TUTELA No. ' . $noTutela . ' - SOLICITUD DE PRUEBAS' .
        ($vencimientoLegible !== '' ? ' - VENCE ' . $vencimientoLegible : '') .
        ($nombreCorto !== '' ? ' - ' . $nombreCorto : '');
}

$pretensiones = [];
foreach((is_array($correo['pretensiones'] ?? null) ? $correo['pretensiones'] : []) as $pr){
    $pr = trim((string)$pr);
    if($pr !== '' && count($pretensiones) < 4) $pretensiones[] = $pr;
}

$notas = trim((string)($correo['notas'] ?? ''));
if(!empty($quitadosAfiliaciones)) $notas = 'Se quitaron de "Para" los correos de operaciones y/o afiliaciones porque el caso no discute afiliación (' . implode(', ', $quitadosAfiliaciones) . '). ' . $notas;
if(!empty($quitados)) $notas = 'Se quitaron de "Para" correos de entidades que la tutela no señala (' . implode(', ', $quitados) . '). ' . $notas;
if(!$para) $notas = 'No se pudo determinar a qué áreas enviar (ningún correo de la agenda quedó en "Para") — completa los destinatarios. ' . $notas;

echo json_encode([
    'para' => $para,
    'cc' => $cc,
    'asunto' => $asuntoFinal,
    'cuerpo' => trim((string)$correo['cuerpo']),
    'notas' => trim($notas),
    'urgente' => $urgente,
    'pretensiones' => $pretensiones,
], JSON_UNESCAPED_UNICODE);
