<?php
// Consulta de actuaciones en la Rama Judicial (2026-11-13, pedido del usuario: «integrar la lectura de los procesos en la rama judicial
// para ver sus anotaciones»). Usa la Consulta Nacional Unificada (https://consultaprocesos.ramajudicial.gov.co), que es PÚBLICA y busca por el
// número de radicación de 23 dígitos — no usa usuario ni contraseña de nadie. El navegador no puede llamarla directo (CORS), por eso la app
// le pregunta a este archivo y este archivo le pregunta a la Rama.
//
// Entrada (POST, JSON): { "radicado": "25000232600020090110201", "paginas": 3 }
// Salida: { ok, radicado, procesos: [ { idProceso, despacho, departamento, sujetos, fechaProceso, fechaUltimaActuacion, totalActuaciones, actuaciones: [...] } ] }
//
// No guarda nada ni toca SharePoint: solo lee y devuelve. Sube a public_html/rama-judicial/ (misma idea que robot-tutelas/).
// Aviso: la Rama no documenta este servicio como API oficial; si algún día cambia, solo hay que ajustar este archivo.

header('Content-Type: application/json; charset=utf-8');
$origenesPermitidos = ['https://sergioherrerar.github.io', 'https://www.lexaraabogados.com', 'http://localhost:5678', 'http://localhost:5173'];
$origen = $_SERVER['HTTP_ORIGIN'] ?? '';
if(in_array($origen, $origenesPermitidos, true)){
    header('Access-Control-Allow-Origin: ' . $origen);
    header('Vary: Origin');
}
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if(($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS'){ http_response_code(204); exit; }
if(($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST'){ http_response_code(405); echo json_encode(['ok' => false, 'error' => 'Método no permitido.']); exit; }

const RAMA_BASE = 'https://consultaprocesos.ramajudicial.gov.co:448/api/v2';
@set_time_limit(90);

function responder($codigo, $datos){ http_response_code($codigo); echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }

// Límite sencillo por IP (40 consultas por minuto) para no abusar del servicio público de la Rama.
function limitarUso(){
    $ip = preg_replace('/[^0-9a-fA-F:.]/', '', $_SERVER['REMOTE_ADDR'] ?? 'x');
    $archivo = sys_get_temp_dir() . '/rama-judicial-' . md5($ip) . '.json';
    $ahora = time(); $marcas = [];
    if(is_file($archivo)){ $leido = json_decode((string)@file_get_contents($archivo), true); if(is_array($leido)) $marcas = $leido; }
    $marcas = array_values(array_filter($marcas, function($t) use ($ahora){ return $t > $ahora - 60; }));
    if(count($marcas) >= 40) responder(429, ['ok' => false, 'error' => 'Demasiadas consultas seguidas. Espere un minuto e intente de nuevo.']);
    $marcas[] = $ahora; @file_put_contents($archivo, json_encode($marcas), LOCK_EX);
}

function pedirRama($ruta){
    $ch = curl_init(RAMA_BASE . $ruta);
    $opc = [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 25, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_HTTPHEADER => ['Accept: application/json', 'User-Agent: Mozilla/5.0 (compatible; LexaraConsulta/1.0)'],
    ];
    $ca = getenv('RAMA_CACERT'); if($ca && is_file($ca)) $opc[CURLOPT_CAINFO] = $ca;   // solo para pruebas locales
    curl_setopt_array($ch, $opc);
    $cuerpo = curl_exec($ch);
    $codigo = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if($cuerpo === false) return [null, 0, $err ?: 'sin respuesta'];
    $json = json_decode($cuerpo, true);
    return [$json, $codigo, $json === null ? 'respuesta no válida' : ''];
}

$entrada = json_decode(file_get_contents('php://input'), true);
if(!is_array($entrada)) responder(400, ['ok' => false, 'error' => 'Solicitud inválida.']);
// Detalle completo (2026-11-14): { "idProceso": N } → datos del proceso, sujetos procesales y documentos.
if(!empty($entrada['idProceso'])){
    $id = (int)$entrada['idProceso'];
    if($id <= 0) responder(400, ['ok' => false, 'error' => 'idProceso inválido.']);
    limitarUso();
    // La Rama a veces falla en una de varias consultas seguidas: se reintenta (hasta 3 veces) cada una.
    $pedirReint = function($ruta){ for($i = 0; $i < 3; $i++){ $r = pedirRama($ruta); if($r[0] !== null && $r[1] < 500) return $r; usleep(350000 * ($i + 1)); } return $r; };
    list($det, $c1, $f1) = $pedirReint('/Proceso/Detalle/' . $id);
    list($suj, $c2, $f2) = $pedirReint('/Proceso/Sujetos/' . $id . '?pagina=1');
    list($doc, $c3, $f3) = $pedirReint('/Proceso/Documentos/' . $id);
    if($det === null && $suj === null && $doc === null) responder(502, ['ok' => false, 'error' => 'La Rama Judicial no respondió el detalle del proceso (' . ($f1 ?: 'sin respuesta') . '). Intente de nuevo en unos minutos.']);
    $sujetos = is_array($suj['sujetos'] ?? null) ? $suj['sujetos'] : [];
    $d = is_array($det) ? $det : [];
    responder(200, [
        'ok' => true,
        'errores' => ['detalle' => $det === null, 'sujetos' => $suj === null, 'documentos' => $doc === null],
        'detalle' => $det ? ['despacho' => $d['despacho'] ?? '', 'ponente' => $d['ponente'] ?? '', 'tipoProceso' => $d['tipoProceso'] ?? '', 'claseProceso' => $d['claseProceso'] ?? '', 'subclaseProceso' => $d['subclaseProceso'] ?? '', 'recurso' => $d['recurso'] ?? '', 'ubicacion' => $d['ubicacion'] ?? '', 'contenidoRadicacion' => $d['contenidoRadicacion'] ?? '', 'fechaProceso' => $d['fechaProceso'] ?? null, 'ultimaActualizacion' => $d['ultimaActualizacion'] ?? null] : null,
        'sujetos' => array_map(function($s){ return ['tipo' => $s['tipoSujeto'] ?? '', 'nombre' => $s['nombreRazonSocial'] ?? '', 'identificacion' => $s['identificacion'] ?? '', 'emplazado' => !empty($s['esEmplazado'])]; }, $sujetos),
        'documentos' => is_array($doc) ? array_map(function($x){ return ['nombre' => $x['nombre'] ?? '', 'descripcion' => $x['descripcion'] ?? '', 'tipo' => $x['tipo'] ?? '', 'fechaCarga' => $x['fechaCarga'] ?? null, 'consecutivo' => $x['consActuacion'] ?? null]; }, $doc) : [],
    ]);
}
$radicado = preg_replace('/\D+/', '', (string)($entrada['radicado'] ?? ''));
if(strlen($radicado) !== 23) responder(400, ['ok' => false, 'error' => 'El número de radicación debe tener 23 dígitos (el «No. completo» del proceso).']);
$maxPaginas = max(1, min(10, (int)($entrada['paginas'] ?? 3)));
$desde = max(1, (int)($entrada['desde'] ?? 1));   // página inicial: la app pide el resto de las actuaciones por tandas
limitarUso();

list($lista, $cod, $falla) = pedirRama('/Procesos/Consulta/NumeroRadicacion?numero=' . $radicado . '&SoloActivos=false&pagina=1');
if($lista === null || $cod >= 400 || !isset($lista['procesos'])){
    responder(502, ['ok' => false, 'error' => 'La Rama Judicial no respondió la consulta' . ($falla ? ' (' . $falla . ')' : ' (código ' . $cod . ')') . '. Intente de nuevo en unos minutos.']);
}

$salida = [];
foreach(array_slice($lista['procesos'], 0, 3) as $p){
    $id = $p['idProceso'] ?? null;
    $item = [
        'idProceso' => $id, 'llaveProceso' => $p['llaveProceso'] ?? $radicado, 'despacho' => trim((string)($p['despacho'] ?? '')), 'departamento' => $p['departamento'] ?? '',
        'sujetos' => $p['sujetosProcesales'] ?? '', 'fechaProceso' => $p['fechaProceso'] ?? null, 'fechaUltimaActuacion' => $p['fechaUltimaActuacion'] ?? null,
        'esPrivado' => !empty($p['esPrivado']), 'totalActuaciones' => 0, 'actuaciones' => [],
    ];
    if($id && empty($p['esPrivado'])){
        for($pg = $desde; $pg < $desde + $maxPaginas; $pg++){
            list($act, $c2, $f2) = pedirRama('/Proceso/Actuaciones/' . $id . '?pagina=' . $pg);
            if($act === null || $c2 >= 400 || !isset($act['actuaciones'])){ if($pg === $desde) $item['error'] = 'No se pudieron leer las actuaciones' . ($f2 ? ' (' . $f2 . ')' : '') . '.'; break; }
            foreach($act['actuaciones'] as $a){
                $item['actuaciones'][] = [
                    'consecutivo' => $a['consActuacion'] ?? null, 'fecha' => $a['fechaActuacion'] ?? null, 'registro' => $a['fechaRegistro'] ?? null,
                    'actuacion' => trim((string)($a['actuacion'] ?? '')), 'anotacion' => trim((string)($a['anotacion'] ?? '')),
                    'fechaInicial' => $a['fechaInicial'] ?? null, 'fechaFinal' => $a['fechaFinal'] ?? null, 'conDocumentos' => !empty($a['conDocumentos']),
                ];
                if(!empty($a['cant'])) $item['totalActuaciones'] = (int)$a['cant'];
            }
            if(count($act['actuaciones']) === 0) break;
            if($item['totalActuaciones'] && count($item['actuaciones']) >= $item['totalActuaciones']) break;
        }
        if(!$item['totalActuaciones']) $item['totalActuaciones'] = count($item['actuaciones']);
    }
    $salida[] = $item;
}
responder(200, ['ok' => true, 'radicado' => $radicado, 'consultadoEn' => gmdate('c'), 'procesos' => $salida]);
