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

// Revisión de errores (2026-10-06, pedido del usuario): un correo con varios
// PDF pesados puede tardar más de los 30 s que suele traer PHP por defecto, y
// decodificar/reenviar tantos adjuntos en base64 gasta mucha memoria — en
// cualquiera de los dos casos el servidor cortaba la conexión sin avisar.
@set_time_limit(190);
@ini_set('memory_limit', '512M');

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
    // Si el cuerpo llegó vacío porque pesaba más de lo que el servidor acepta
    // (post_max_size), PHP lo descarta en silencio — se avisa el límite real.
    echo json_encode(['error' => 'Solicitud inválida (no llegó un JSON válido) — puede que los adjuntos superen el tamaño máximo que acepta el servidor (post_max_size = ' . ini_get('post_max_size') . ').']);
    exit;
}

$asunto = (string)($entrada['asunto'] ?? '');
$cuerpo = (string)($entrada['cuerpo'] ?? '');
$adjuntos = is_array($entrada['adjuntos'] ?? null) ? $entrada['adjuntos'] : [];
// "Entrenar IA" (2026-09-23, pedido explícito del usuario) — correcciones
// reales que el abogado a cargo ya dejó sobre el campo Tema de tutelas
// guardadas (columna "Corrección IA" en SharePoint) — el portal las manda
// acá como ejemplos de referencia reales, con más peso que la lista
// genérica de categorías de abajo.
$correcciones = is_array($entrada['correcciones'] ?? null) ? $entrada['correcciones'] : [];

// Límite de seguridad — no mandar cantidades absurdas de adjuntos a la API
// (ni de costo, ni de tamaño de la solicitud). Subido de 8 a 20 y luego a 40
// (2026-09-23, bug real dos veces seguidas: correos de "RV:"/reenviados
// acumulan muchos adjuntos de rondas anteriores).
if(count($adjuntos) > 40){
    http_response_code(400);
    echo json_encode(['error' => 'Demasiados adjuntos en este correo (máximo 40) — extrae los datos a mano para este caso.']);
    exit;
}

// Campos reales del formulario "Nueva tutela" (ver TutelaDrawer.jsx /
// config.js, lista "Tutelas") — se le pide a Claude exactamente estas
// claves, ni una más ni una menos, para que el portal las pueda usar
// directo sin tener que traducir nombres.
$camposEsperados = <<<TXT
- NoTutela (texto, el número CORTO interno que la entidad remitente le asigna a la tutela — normalmente 4 o 5 dígitos, ej. "28159" — casi siempre aparece en el asunto del correo, como "TUTELA No. 28159" o similar. IMPORTANTE: nunca pongas aquí el radicado judicial largo (ese va en el campo Proceso, ya sea completo o solo su parte año-número). Si de verdad no encuentras un número corto de este tipo en ningún lado del correo, deja este campo vacío en vez de usar el radicado judicial o cualquier otro número que no sea este)
- Entidad (texto, casi siempre "GRUPO COLMEDICA")
- Cliente (EXACTAMENTE uno de estos 3 textos, tal cual, sin variarlos: "COLMEDICA MEDICINA PREPAGADA S.A.", "ALIANSALUD ENTIDAD PROMOTORA DE SALUD S.A.", "UNIDAD MÉDICA Y DE DIAGNÓSTICO S.A.")
- TipoVinculacionEntidad (exactamente "Accionada" o "Vinculada")
- Prestacion (exactamente "Asistencial", "Económica" o "Administrativa")
- Departamento (texto, nombre real de un departamento de Colombia)
- Ciudad (texto)
- Juzgado (texto)
- Proceso (el "número corto" del proceso, formato EXACTO aaaa-nnnnn — año de 4 dígitos, guion, número de 5 dígitos, ej. "2026-00942". Si en el correo aparece el radicado judicial completo y largo, como "23-001-40-03-003-2026-00942-00", saca de ahí SOLO esa parte año-número de 5 dígitos — nunca pongas el radicado completo en este campo)
- FechaNotificacion (fecha en formato aaaa-mm-dd en que el juzgado notificó la tutela o el auto a la entidad. Si el correo o los documentos no la dicen con claridad, déjala vacía — el portal usará el día en que llegó el correo)
- DiasTermino (número ENTERO de días que el juez o el correo otorgan para contestar — ej. "otorgó dos (2) días" → 2, "tres días hábiles" → 3, "48 horas" → 2. Solo el número, sin texto. Déjalo vacío si el plazo no se expresa en días)
- FechaVencimiento (fecha aaaa-mm-dd. SOLO si el correo o los documentos dicen una fecha límite concreta, como "hasta el 10 de octubre". Si el plazo se expresa en días (DiasTermino), déjala VACÍA y NO la calcules tú: el portal la calcula con días hábiles — sin sábados, domingos ni festivos de Colombia)
- TipoRespuesta (exactamente uno de: ACLARACION, ALCANCE, APLAZAMIENTO, CUMPLIMIENTO FALLO, CORRECION, IMPUGNACION, MODULACION, NULIDAD, REQUERIMIENTO, TUTELA — la PRIMERA vez que se ve un caso casi siempre es TUTELA, pero léelo del contenido real del correo, no lo asumas siempre)
- MedidaCautelar (exactamente "Sí" o "No")
- AgenciaOficiosa (exactamente "Sí" o "No")
- Usuario (texto, nombre del accionante/paciente)
- NoIdentificacion (texto, cédula del accionante)
- Correo (texto, correo del juzgado que envía la notificación)
- Solicita (texto largo, resumen en tus propias palabras de qué pide la tutela)
- Tema (categoría de la tutela — ver instrucciones)
TXT;

// 2026-09-24, pedido explícito del usuario: mandó la guía REAL de criterios
// de clasificación del despacho ("CRITERIOS DE CLASIFICACIÓN.docx") — es
// mucho más precisa que la lista genérica que había antes, porque el
// criterio correcto depende de CUÁL Cliente (Colmédica/Aliansalud tienen
// reglas distintas para el mismo Tema) Y de la Prestación, no solo de
// palabras clave. Se transcribe tal cual el documento (no parafraseado) para
// no perder matices reales del criterio del despacho. El documento no cubre
// UNIDAD MÉDICA Y DE DIAGNÓSTICO S.A. (el 3er cliente real) — mientras no
// haya una guía propia para ella, se le pide a Claude aplicar el mismo
// criterio de Colmédica por defecto (ver $instrucciones más abajo).
$criteriosClasificacion = <<<TXT
1. PRESTACIÓN ASISTENCIAL — COLMÉDICA MEDICINA PREPAGADA
Corresponde a todos los asuntos relacionados con servicios de salud. El tema se determina conforme a lo expuesto en el escrito de tutela:
- Agendamiento de consulta: cuando el accionante alega falta de agenda.
- Exclusión del servicio: cuando solicita autorización de medicamentos, no obstante los medicamentos no hacen parte de las coberturas del contrato motivo por el cual son exclusión; igualmente, cuando manifiesta que otro tipo de servicios le fueron negados por exclusión.
- Exclusión INVIMA: únicamente cuando el escrito indica que el medicamento fue negado por no cumplir con las indicaciones INVIMA.
- Exclusión por topes: cuando la entidad emitió autorización, pero limitada a un tope determinado, esto es, hasta cierto monto.
- Preexistencia: cuando se manifiesta que los servicios fueron negados por tratarse de una patología preexistente.
- Servicio de cuidador o enfermería: cuando esta sea la pretensión.
- Tratamiento integral: cuando esta sea la pretensión principal.
- Autorización y suministro de servicios de salud: tema residual, aplicable cuando se trate de servicios de salud que no encuadren en ninguno de los anteriores.

2. PRESTACIÓN ASISTENCIAL — ALIANSALUD EPS
Corresponde a todos los asuntos relacionados con servicios de salud. El tema se determina así:
- Agendamiento de servicio: cuando el accionante manifiesta que no logra obtener agenda para un servicio y solicita su programación.
- Entrega de medicamentos: cuando el escrito indica que la EPS ya autorizó los medicamentos, pero existen inconvenientes con su entrega.
- Portabilidad: cuando el accionante se encuentra en un municipio distinto a Bogotá y solicita que el servicio se le brinde en dicho municipio, o que se le active o renueve la portabilidad.
- Puerta de entrada / red no adscrita: cuando las órdenes médicas provienen del acceso a través de otra entidad y no de prestadores adscritos a Aliansalud EPS. Caso típico: se acciona contra Colmédica Medicina Prepagada y el juzgado vincula a la EPS, sin que el accionante mencione ni se evidencien órdenes de prestadores adscritos a esta, sino que provienen de CMP.
- Servicio no PBS: cuando se solicitan silla de ruedas, medias, plantillas, equinoterapia, acompañamiento terapéutico en contexto escolar o musicoterapia, servicios excluidos del Plan de Beneficios en Salud.
- Servicio de cuidador o enfermería: cuando esta sea la pretensión.
- Tratamiento integral: cuando esta sea la pretensión.
- Autorización y suministro de servicios de salud: tema residual, aplicable cuando se trate de servicios de salud que no encuadren en ninguno de los anteriores.

3. PRESTACIÓN ECONÓMICA
- Colmédica Medicina Prepagada: asuntos financieros, incapacidades, licencias o reembolsos.
- Aliansalud EPS: asuntos financieros, incapacidades, licencias, reembolsos y exoneración de cuotas moderadoras y copagos.
En ambos casos, el Tema describe la particularidad puntual del caso (ej. "Reembolso", "Incapacidad", "Licencia de maternidad", "Exoneración cuota moderadora") — no hay una lista cerrada para esta Prestación.

4. PRESTACIÓN ADMINISTRATIVA (igual para cualquier cliente)
- Derechos de petición: solicitudes de respuesta a derechos de petición.
- Afiliación: inconvenientes relacionados con la afiliación.
- Estabilidad laboral reforzada: solicitudes de estabilidad laboral reforzada.
- Solicitudes a otra entidad: aplica cuando la EPS o CMP no son las entidades accionadas y lo pretendido no las involucra; por ejemplo, cuando se acciona contra una secretaría de salud solicitando certificado de discapacidad, o contra una administración por cuotas de administración.
TXT;

// 2026-09-23, pedido explícito del usuario viendo un correo real: "hay tres
// clientes... si la tutela vincula colmedica y aliansalud se debe hacer un
// registro por cada uno" — una misma tutela puede señalar a más de uno de
// los 3 clientes reales (Colmedica/Aliansalud/Unidad Médica), y en ese caso
// hace falta UN REGISTRO POR CADA CLIENTE, no uno solo con los 3 mezclados.
// 2026-09-23, pedido explícito del usuario ("Entrenar IA") — el abogado a
// cargo va dejando correcciones reales sobre casos anteriores donde el
// robot categorizó mal el Tema; se le muestran a Claude como precedentes
// reales del despacho, con más peso que la lista genérica de arriba.
$correccionesTexto = '';
if($correcciones){
    $lineas = [];
    foreach($correcciones as $c){
        $noT = trim((string)($c['noTutela'] ?? ''));
        $temaAnterior = trim((string)($c['temaActual'] ?? ''));
        $nota = trim((string)($c['correccion'] ?? ''));
        if(!$nota) continue;
        $lineas[] = "- Tutela {$noT} (Tema que había quedado: \"{$temaAnterior}\"): {$nota}";
    }
    if($lineas){
        $correccionesTexto = "ADEMÁS, estas son correcciones REALES que el abogado a cargo ya dejó sobre casos anteriores de este mismo despacho — tenlas en cuenta como criterio de referencia, con más peso que la guía de criterios de arriba si entran en conflicto, sobre todo si el caso nuevo se parece a alguno de estos:\n" . implode("\n", $lineas);
    }
}

// 2026-09-25, pedido explícito del usuario: "cuando se refiera a la IA se
// nombre tal cual LexIA" — nunca genérico ("la IA", "el asistente").
$instrucciones = "Eres LexIA, el asistente de inteligencia artificial del despacho de abogados \"md abogados sas\" que extrae datos de una tutela judicial colombiana recibida por correo electrónico. Si en algún texto que generes (por ejemplo el campo Solicita) necesitas referirte a ti misma, usa SIEMPRE el nombre \"LexIA\" — nunca \"la IA\" ni \"el asistente\" genérico. " .
    "Lee el asunto, el cuerpo del correo y los documentos adjuntos (pueden ser PDF o imágenes escaneadas de la tutela). " .
    "Esta tutela puede señalar/vincular a MÁS DE UNO de los 3 clientes reales del despacho (COLMEDICA MEDICINA PREPAGADA S.A., ALIANSALUD ENTIDAD PROMOTORA DE SALUD S.A., UNIDAD MÉDICA Y DE DIAGNÓSTICO S.A.) al mismo tiempo — en ese caso arma UN REGISTRO POR CADA CLIENTE señalado (mismos datos generales de la tutela, cambiando solo el campo Cliente en cada uno), en vez de un solo registro mezclado. Si solo aplica a un cliente, devuelve un solo registro igual. " .
    "Para los campos Prestación y Tema, aplica ESTRICTAMENTE esta guía real de criterios de clasificación del despacho — el criterio correcto depende de CUÁL Cliente Y de la Prestación, no son categorías genéricas ni palabras clave sueltas. Analiza de fondo qué es lo que realmente está pidiendo/reclamando el accionante y compáralo contra las condiciones exactas de cada Tema antes de elegir uno. Para UNIDAD MÉDICA Y DE DIAGNÓSTICO S.A. (no cubierta explícitamente en la guía) aplica el mismo criterio que para COLMEDICA MEDICINA PREPAGADA S.A. Si de verdad el caso no encaja en ninguna condición descrita, usa el Tema residual \"Autorización y suministro de servicios de salud\" (Asistencial) en vez de inventar uno nuevo. " .
    // 2026-09-25, bug real reportado por el usuario (con captura): Claude
    // escribía el Tema tal cual aparece redactado en la guía de arriba (ej.
    // "Entrega de medicamentos", con mayúscula solo al inicio) — pero el
    // campo Tema en el portal es un DESPLEGABLE de una lista fija real en
    // SharePoint, y esa lista está toda EN MAYÚSCULAS ("ENTREGA DE
    // MEDICAMENTOS"). Si no coincide letra por letra (mayúsculas incluidas)
    // con una opción real de la lista, no hace match con ninguna y queda
    // como un valor huérfano que el usuario tiene que corregir a mano.
    "IMPORTANTE sobre el formato del Tema: la guía de arriba está redactada en minúscula/mayúscula normal SOLO para que se entienda fácil el criterio — pero el valor que debes escribir en el campo Tema va SIEMPRE completo EN MAYÚSCULAS (ej. la guía dice \"Entrega de medicamentos\", pero tú escribes \"ENTREGA DE MEDICAMENTOS\"), sin importar cómo esté escrito arriba, porque es un desplegable de una lista fija real y así es como están guardadas esas opciones:\n{$criteriosClasificacion}\n\n" .
    "Devuelve SOLO un objeto JSON (sin texto adicional antes o después, sin bloques de markdown) con esta forma exacta: {\"registros\": [ {...un registro...}, {...otro registro si aplica...} ]}. Cada registro debe tener EXACTAMENTE estas claves, dejando \"\" (cadena vacía) en lo que no puedas determinar con certeza — nunca inventes un dato que no esté en el correo:\n\n" . $camposEsperados;
// Correcciones (2026-09-29, pedido explícito del usuario, por costo de la
// API) — se saca del bloque estable de arriba y se manda como SU PROPIO
// bloque de sistema, al final: antes, agregar UNA corrección nueva en
// "Entrenar IA" invalidaba la caché de las ~4,100 tokens de la guía
// completa (porque quedaba en medio del mismo texto). Separado así, la
// guía de criterios sigue en caché aunque se agreguen correcciones nuevas
// — solo este bloque, más chico, se vuelve a pagar completo cuando cambia.

$contenido = [];
// Nombre del adjunto que quedó en cada índice de $contenido (2026-09-23) —
// permite, si Claude devuelve un error sobre "content.N", decirle al usuario
// EXACTAMENTE qué archivo adjunto tuvo el problema (p.ej. un PDF con clave).
$nombresPorIndice = [];
$fechaCorreoTexto = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($entrada['fechaCorreo'] ?? '')) ? "Fecha en que llegó este correo: " . $entrada['fechaCorreo'] . "\n" : '';
$textoCorreo = "{$fechaCorreoTexto}Asunto del correo: {$asunto}\n\nCuerpo del correo:\n{$cuerpo}";
$contenido[] = ['type' => 'text', 'text' => $textoCorreo];
$nombresPorIndice[] = '(texto del correo)';

// Excel NO se manda (Claude no lo puede leer visualmente como un PDF/imagen)
// — se ignora por ahora; si el correo trae la tutela en un Excel adjunto en
// vez de PDF/imagen, hay que extraerla a mano. Ver nota en el proyecto.
foreach($adjuntos as $adj){
    $tipo = strtolower(trim(explode(';', (string)($adj['tipo'] ?? ''))[0]));
    $base64 = (string)($adj['base64'] ?? '');
    $nombreAdj = (string)($adj['nombre'] ?? 'adjunto sin nombre');
    if(!$base64) continue;
    // Outlook a veces manda un PDF/foto real como "application/octet-stream"
    // o sin tipo — antes se ignoraba en silencio y LexIA nunca lo leía. Se
    // deduce por la extensión del nombre.
    $ext = strtolower(pathinfo($nombreAdj, PATHINFO_EXTENSION));
    if($tipo === '' || $tipo === 'application/octet-stream'){
        $porExtension = ['pdf' => 'application/pdf', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'gif' => 'image/gif', 'webp' => 'image/webp'];
        if(isset($porExtension[$ext])) $tipo = $porExtension[$ext];
    }
    if($tipo === 'image/jpg') $tipo = 'image/jpeg';
    // La API solo acepta estas 4 imágenes — un TIFF/BMP/HEIC (escáneres,
    // celulares) hacía que rechazara TODA la solicitud, no solo ese archivo.
    if(in_array($tipo, ['image/jpeg', 'image/png', 'image/gif', 'image/webp'], true)){
        $contenido[] = ['type' => 'image', 'source' => ['type' => 'base64', 'media_type' => $tipo, 'data' => $base64]];
        $nombresPorIndice[] = $nombreAdj;
    } elseif($tipo === 'application/pdf'){
        $contenido[] = ['type' => 'document', 'source' => ['type' => 'base64', 'media_type' => $tipo, 'data' => $base64]];
        $nombresPorIndice[] = $nombreAdj;
    }
}

$body = [
    'model' => 'claude-sonnet-5',
    // Subido de 1500 a 4000 (2026-09-23, bug real: "Claude no devolvió un
    // JSON válido con registros" — con varios registros por cliente + el
    // campo Tema nuevo, la respuesta se quedaba corta y el JSON llegaba
    // incompleto/cortado a la mitad).
    // 4000 -> 8000 (2026-10-06): con varios registros por cliente y los campos
    // nuevos (DiasTermino, fechas, Tema...) la respuesta podía quedar cortada a
    // la mitad y el JSON llegaba incompleto. Solo se paga lo que se genera.
    'max_tokens' => 8000,
    // 2026-09-23, pedido explícito del usuario ("que la extracción sea más
    // rápida sin perder nada") — cache_control en las instrucciones: son
    // siempre las mismas, así que Claude no tiene que "releerlas" de cero
    // en cada correo que se procese en la misma sesión de trabajo. No
    // afecta los adjuntos (esos sí son distintos en cada correo, siguen
    // procesándose completos — nada se deja de leer). Van en 2 bloques
    // separados (ver nota arriba de $correccionesTexto) — así agregar una
    // corrección nueva no invalida la caché de la guía de criterios.
    'system' => [
        ['type' => 'text', 'text' => $instrucciones, 'cache_control' => ['type' => 'ephemeral']],
        ['type' => 'text', 'text' => $correccionesTexto ?: '(sin correcciones adicionales todavía)', 'cache_control' => ['type' => 'ephemeral']],
    ],
    'messages' => [
        ['role' => 'user', 'content' => $contenido],
    ],
];

function llamarClaude(array $body, string $apiKey){
    $json = json_encode($body);
    // Reintenta (hasta 3 intentos, con pausa) SOLO errores pasajeros de la API:
    // 429 (límite de velocidad), 5xx y 529 ("overloaded") — no cuestan nada
    // porque la solicitud nunca llegó a procesarse. Cualquier otro error
    // (saldo, solicitud inválida…) se devuelve de una.
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
        curl_setopt($ch, CURLOPT_TIMEOUT, 150);
        $respuesta = curl_exec($ch);
        $codigoHttp = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $errorCurl = curl_error($ch);
        curl_close($ch);
        $pasajero = !$errorCurl && ($codigoHttp === 429 || $codigoHttp === 529 || $codigoHttp >= 500);
        if(!$pasajero || $intento === 3) break;
        sleep(3 * $intento);
    }
    return [$respuesta, $codigoHttp, $errorCurl];
}

// 2026-09-23, pedido explícito del usuario: los PDF que las EPS mandan
// protegidos con contraseña casi siempre usan la CÉDULA del accionante
// (paciente) como contraseña — un dato que casi siempre también aparece en
// texto plano en el asunto/cuerpo del correo, no solo dentro del PDF. Si
// Claude rechaza un adjunto por venir protegido, se buscan posibles cédulas
// en el texto del correo y se intenta abrir ese PDF puntual con Ghostscript
// probándolas como contraseña, para no tener que pedirle nada al usuario.
function extraerPosiblesCedulas($texto){
    $candidatas = [];
    if(preg_match_all('/(?:c\.?\s?c\.?|c[eé]dula|identificaci[oó]n|identificado\s+con)\D{0,20}(\d{6,10})/iu', $texto, $m)){
        $candidatas = array_merge($candidatas, $m[1]);
    }
    if(preg_match_all('/\b(\d{6,10})\b/', $texto, $m2)){
        $candidatas = array_merge($candidatas, $m2[1]);
    }
    return array_values(array_unique($candidatas));
}

function intentarDesprotegerPdf(string $base64Pdf, array $candidatas){
    if(!function_exists('shell_exec') || !$candidatas) return null;
    $gs = trim((string)@shell_exec('command -v gs 2>/dev/null'));
    if(!$gs) return null;
    $tmpIn = tempnam(sys_get_temp_dir(), 'pdfin_');
    $tmpOut = tempnam(sys_get_temp_dir(), 'pdfout_');
    file_put_contents($tmpIn, base64_decode($base64Pdf));
    $resultado = null;
    foreach($candidatas as $clave){
        @unlink($tmpOut);
        $cmd = $gs . ' -q -dBATCH -dNOPAUSE -sDEVICE=pdfwrite -sPDFPassword=' . escapeshellarg($clave)
            . ' -sOutputFile=' . escapeshellarg($tmpOut) . ' ' . escapeshellarg($tmpIn) . ' 2>&1';
        @shell_exec($cmd);
        if(file_exists($tmpOut) && filesize($tmpOut) > 0){
            $resultado = base64_encode(file_get_contents($tmpOut));
            break;
        }
    }
    @unlink($tmpIn);
    if(file_exists($tmpOut)) @unlink($tmpOut);
    return $resultado;
}

[$respuesta, $codigoHttp, $errorCurl] = llamarClaude($body, $apiKey);

if($errorCurl){
    http_response_code(502);
    echo json_encode(['error' => 'No se pudo conectar con la API de Claude: ' . $errorCurl]);
    exit;
}

$data = json_decode($respuesta, true);

// Si el único problema fue un PDF protegido con contraseña, se intenta
// desproteger ESE adjunto puntual con las posibles cédulas del correo y se
// reintenta UNA sola vez con esa versión ya desprotegida.
if($codigoHttp !== 200){
    $detalle = $data['error']['message'] ?? $respuesta;
    if(preg_match('/content\.(\d+)\.pdf.*password protected/i', $detalle, $mIdx)){
        $indice = (int)$mIdx[1];
        $candidatas = extraerPosiblesCedulas($asunto . ' ' . $cuerpo);
        $desprotegido = isset($contenido[$indice]['source']['data'])
            ? intentarDesprotegerPdf($contenido[$indice]['source']['data'], $candidatas)
            : null;
        if($desprotegido){
            $contenido[$indice]['source']['data'] = $desprotegido;
            $body['messages'][0]['content'] = $contenido;
            [$respuesta, $codigoHttp, $errorCurl] = llamarClaude($body, $apiKey);
            if($errorCurl){
                http_response_code(502);
                echo json_encode(['error' => 'No se pudo conectar con la API de Claude: ' . $errorCurl]);
                exit;
            }
            $data = json_decode($respuesta, true);
        } else {
            $nombreAdj = $nombresPorIndice[$indice] ?? 'uno de los adjuntos';
            http_response_code(502);
            echo json_encode(['error' => "El adjunto \"{$nombreAdj}\" viene protegido con contraseña y no se pudo abrir automáticamente probando la cédula del accionante que aparece en el correo. Ábrelo a mano en tu computador (la contraseña suele ser la cédula del paciente) y extrae los datos de ese archivo manualmente."]);
            exit;
        }
    }
}

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

// Claude a veces envuelve el JSON en ```json ... ``` o agrega una frase antes/
// después aunque se le pida que no lo haga — se toma desde la primera "{" hasta
// la última "}" antes de decodificar (2026-10-06, antes solo se quitaba la
// envoltura de markdown y cualquier otro texto hacía fallar la extracción).
$texto = trim($texto);
$stopReason = (string)($data['stop_reason'] ?? '');
$posIni = strpos($texto, '{');
$posFin = strrpos($texto, '}');
$candidato = ($posIni !== false && $posFin !== false && $posFin > $posIni) ? substr($texto, $posIni, $posFin - $posIni + 1) : $texto;

$data2 = json_decode($candidato, true);
$registros = is_array($data2) ? ($data2['registros'] ?? null) : null;
// Por si devolvió directamente la lista de registros, sin el objeto envolvente.
if(!is_array($registros) && is_array($data2) && isset($data2[0]) && is_array($data2[0])) $registros = $data2;
if(!is_array($registros) || count($registros) === 0){
    http_response_code(502);
    // El mensaje dice POR QUÉ falló (respuesta cortada, rechazo del modelo o
    // texto sin JSON) y trae el comienzo de lo que contestó — antes solo decía
    // "no devolvió un JSON válido" y no había forma de saber la causa.
    if($stopReason === 'max_tokens'){
        $causa = 'la respuesta de LexIA quedó cortada por ser demasiado larga (el correo tiene muchos datos). Intenta de nuevo; si se repite, usa "Extraer adjuntos" y registra la tutela a mano.';
    } elseif($stopReason === 'refusal'){
        $causa = 'el modelo se negó a procesar este contenido.';
    } elseif($texto === ''){
        $causa = 'la respuesta llegó vacía' . ($stopReason ? " (motivo: {$stopReason})" : '') . '. Intenta de nuevo.';
    } else {
        $vista = trim(preg_replace('/\s+/u', ' ', function_exists('mb_substr') ? mb_substr($texto, 0, 280) : substr($texto, 0, 280)));
        $causa = 'LexIA contestó con texto en vez de datos: "' . $vista . '"' . (strlen($texto) > 280 ? '…' : '') . '. Suele pasar cuando el correo o los adjuntos no parecen una tutela; intenta de nuevo o revisa los adjuntos.';
    }
    echo json_encode(['error' => 'No se pudo leer la respuesta de LexIA: ' . $causa, 'crudo' => $texto, 'stop_reason' => $stopReason], JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

echo json_encode(['registros' => $registros]);
