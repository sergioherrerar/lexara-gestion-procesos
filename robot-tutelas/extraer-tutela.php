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
        $correccionesTexto = "\n\nADEMÁS, estas son correcciones REALES que el abogado a cargo ya dejó sobre casos anteriores de este mismo despacho — tenlas en cuenta como criterio de referencia, con más peso que la guía de criterios de arriba si entran en conflicto, sobre todo si el caso nuevo se parece a alguno de estos:\n" . implode("\n", $lineas);
    }
}

$instrucciones = "Eres un asistente que extrae datos de una tutela judicial colombiana recibida por correo electrónico, para un despacho de abogados. " .
    "Lee el asunto, el cuerpo del correo y los documentos adjuntos (pueden ser PDF o imágenes escaneadas de la tutela). " .
    "Esta tutela puede señalar/vincular a MÁS DE UNO de los 3 clientes reales del despacho (COLMEDICA MEDICINA PREPAGADA S.A., ALIANSALUD ENTIDAD PROMOTORA DE SALUD S.A., UNIDAD MÉDICA Y DE DIAGNÓSTICO S.A.) al mismo tiempo — en ese caso arma UN REGISTRO POR CADA CLIENTE señalado (mismos datos generales de la tutela, cambiando solo el campo Cliente en cada uno), en vez de un solo registro mezclado. Si solo aplica a un cliente, devuelve un solo registro igual. " .
    "Para los campos Prestación y Tema, aplica ESTRICTAMENTE esta guía real de criterios de clasificación del despacho — el criterio correcto depende de CUÁL Cliente Y de la Prestación, no son categorías genéricas ni palabras clave sueltas. Analiza de fondo qué es lo que realmente está pidiendo/reclamando el accionante y compáralo contra las condiciones exactas de cada Tema antes de elegir uno. Para UNIDAD MÉDICA Y DE DIAGNÓSTICO S.A. (no cubierta explícitamente en la guía) aplica el mismo criterio que para COLMEDICA MEDICINA PREPAGADA S.A. Si de verdad el caso no encaja en ninguna condición descrita, usa el Tema residual \"Autorización y suministro de servicios de salud\" (Asistencial) en vez de inventar uno nuevo:\n{$criteriosClasificacion}" . $correccionesTexto . "\n\n" .
    "Devuelve SOLO un objeto JSON (sin texto adicional antes o después, sin bloques de markdown) con esta forma exacta: {\"registros\": [ {...un registro...}, {...otro registro si aplica...} ]}. Cada registro debe tener EXACTAMENTE estas claves, dejando \"\" (cadena vacía) en lo que no puedas determinar con certeza — nunca inventes un dato que no esté en el correo:\n\n" . $camposEsperados;

$contenido = [];
// Nombre del adjunto que quedó en cada índice de $contenido (2026-09-23) —
// permite, si Claude devuelve un error sobre "content.N", decirle al usuario
// EXACTAMENTE qué archivo adjunto tuvo el problema (p.ej. un PDF con clave).
$nombresPorIndice = [];
$textoCorreo = "Asunto del correo: {$asunto}\n\nCuerpo del correo:\n{$cuerpo}";
$contenido[] = ['type' => 'text', 'text' => $textoCorreo];
$nombresPorIndice[] = '(texto del correo)';

// Excel NO se manda (Claude no lo puede leer visualmente como un PDF/imagen)
// — se ignora por ahora; si el correo trae la tutela en un Excel adjunto en
// vez de PDF/imagen, hay que extraerla a mano. Ver nota en el proyecto.
foreach($adjuntos as $adj){
    $tipo = (string)($adj['tipo'] ?? '');
    $base64 = (string)($adj['base64'] ?? '');
    $nombreAdj = (string)($adj['nombre'] ?? 'adjunto sin nombre');
    if(!$base64) continue;
    if(strpos($tipo, 'image/') === 0){
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
    'max_tokens' => 4000,
    // 2026-09-23, pedido explícito del usuario ("que la extracción sea más
    // rápida sin perder nada") — cache_control en las instrucciones: son
    // siempre las mismas (solo cambian cuando se agrega una corrección
    // nueva en "Entrenar IA"), así que Claude no tiene que "releerlas" de
    // cero en cada correo que se procese en la misma sesión de trabajo. No
    // afecta los adjuntos (esos sí son distintos en cada correo, siguen
    // procesándose completos — nada se deja de leer).
    'system' => [
        ['type' => 'text', 'text' => $instrucciones, 'cache_control' => ['type' => 'ephemeral']],
    ],
    'messages' => [
        ['role' => 'user', 'content' => $contenido],
    ],
];

function llamarClaude(array $body, string $apiKey){
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
