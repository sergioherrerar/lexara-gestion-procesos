<?php
// Portal de clientes — API (2026-11-11). Acciones: solicitar (pide el código), verificar (lo comprueba y abre sesión),
// sesion (quién soy y a qué clientes tengo acceso), procesos (solo los míos), salir.
declare(strict_types=1);
require __DIR__ . '/lib.php';

header('X-Content-Type-Options: nosniff');
$accion = $_GET['a'] ?? '';
$esPost = ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST';

// Las acciones que cambian algo solo se aceptan como POST desde la propia página (cabecera propia: evita formularios de otros sitios).
if ($esPost && ($_SERVER['HTTP_X_PORTAL'] ?? '') !== '1') salir(['error' => 'Solicitud no válida.'], 400);
$entrada = $esPost ? (json_decode((string)file_get_contents('php://input'), true) ?: []) : [];

/** La sesión y, si es del equipo Lexara, el cliente que eligió «ver como» (solo el equipo puede usar «como»; un cliente que lo mande lo ignora). */
function accesoEfectivo(): array {
    $a = sesionActual();
    if (!$a) salir(['ok' => false, 'error' => 'Su sesión venció. Ingrese de nuevo.'], 401);
    if (empty($a['equipo'])) return $a;
    $e = accesoDeOpcion((string)($_GET['como'] ?? ''));
    if (!$e) salir(['ok' => false, 'error' => 'Elija un cliente para ver su portal.'], 400);
    return $e;
}

try {
    switch ($accion) {
        case 'solicitar': {
            if (!$esPost) salir(['error' => 'Método no permitido.'], 405);
            $correo = normalizar((string)($entrada['correo'] ?? ''));
            if (!filter_var($correo, FILTER_VALIDATE_EMAIL)) salir(['error' => 'Escriba un correo válido.'], 400);
            // Límites (2026-11-12, pedido del usuario: «que se puedan enviar varios códigos, por lo menos tres, antes de que salga este error»):
            //   · hasta 6 códigos realmente enviados por correo y hora (los intentos en que el envío falla NO gastan cupo);
            //   · tope general de solicitudes por correo (15/h) y por IP (60/h: una oficina entera comparte la misma IP) contra abusos.
            $maxCodigos = 6;
            $pedidoOk = limitarIntentos('pedido:' . $correo, 15, 3600);
            $ipOk = limitarIntentos('ipx:' . ipCliente(), 60, 3600);
            $cupoOk = limitarIntentos('envio:' . $correo, $maxCodigos, 3600, false);
            if (!$pedidoOk || !$ipOk || !$cupoOk) {
                $min = !$cupoOk ? minutosDeEspera('envio:' . $correo, $maxCodigos, 3600) : 10;
                salir(['error' => 'Ya le enviamos varios códigos. Para su seguridad, espere unos ' . $min . ' minuto' . ($min === 1 ? '' : 's') . ' e intente de nuevo (use el último código que le llegó).'], 429);
            }
            $mensaje = 'Si su correo tiene acceso, le enviamos un código. Revise su bandeja (y el correo no deseado).';
            $acceso = accesoDe($correo);
            $respuesta = ['ok' => true, 'mensaje' => $mensaje];
            if ($acceso && (!empty($acceso['equipo']) || count($acceso['clientes']))) {
                $codigo = (string)random_int(100000, 999999);
                $codigos = leerJson('codigos.json');
                // Se limpian los vencidos y se guardan los ÚLTIMOS 3 códigos vigentes de este correo: si el correo del primero llega tarde, ese código todavía sirve.
                foreach ($codigos as $k => $v) { $v = codigosVigentes($v); if ($v) $codigos[$k] = $v; else unset($codigos[$k]); }
                $previos = codigosVigentes($codigos[$correo] ?? []);
                $previos['lista'][] = ['hash' => claveHash($correo . '|' . $codigo), 'exp' => time() + (int)(cfg()['codigo_minutos'] ?? 10) * 60];
                $previos['lista'] = array_slice($previos['lista'], -3);
                $previos['intentos'] = 0;
                $codigos[$correo] = $previos;
                escribirJson('codigos.json', $codigos);
                if (esDemo()) { $respuesta['codigo_demo'] = $codigo; anotarIntento('envio:' . $correo); }   // SOLO modo demo: nunca en modo real
                else {
                    try { $por = enviarCodigo($correo, $acceso['nombre'], $codigo); if ($por !== 'microsoft') registrarError('Código a ' . $correo . ' enviado por el correo del servidor (Microsoft no respondió).'); anotarIntento('envio:' . $correo); }
                    catch (Throwable $e) {
                        // El código no se pudo mandar: se descarta (no queda uno válido que nadie recibió), se anota el detalle y se avisa claro.
                        error_log('portal-clientes: ' . $e->getMessage());
                        registrarError('Envío del código a ' . $correo . ' — ' . $e->getMessage());
                        array_pop($codigos[$correo]['lista']); if (!$codigos[$correo]['lista']) unset($codigos[$correo]); escribirJson('codigos.json', $codigos);
                        $detalle = !empty($acceso['equipo']) ? ' (Detalle para el equipo: ' . $e->getMessage() . ')' : '';
                        salir(['ok' => false, 'error' => 'No pudimos enviarle el código por correo en este momento. Intente de nuevo en unos minutos; si sigue igual, avise al equipo de Lexara.' . $detalle], 502);
                    }
                }
            }
            salir($respuesta);
        }
        case 'verificar': {
            if (!$esPost) salir(['error' => 'Método no permitido.'], 405);
            $correo = normalizar((string)($entrada['correo'] ?? ''));
            $codigo = preg_replace('/\D/', '', (string)($entrada['codigo'] ?? ''));
            $codigos = leerJson('codigos.json');
            $r = codigosVigentes($codigos[$correo] ?? []);
            $malo = ['error' => 'El código no es correcto o ya venció. Pida uno nuevo.'];
            if (!$r) salir($malo, 401);
            if (($r['intentos'] ?? 0) >= 5) { unset($codigos[$correo]); escribirJson('codigos.json', $codigos); salir($malo, 401); }
            $propuesto = claveHash($correo . '|' . $codigo);
            $acierta = false;
            foreach ($r['lista'] as $item) if (hash_equals($item['hash'], $propuesto)) $acierta = true;
            if (!$acierta) {
                $r['intentos'] = ($r['intentos'] ?? 0) + 1;
                $codigos[$correo] = $r;
                escribirJson('codigos.json', $codigos);
                salir($malo, 401);
            }
            unset($codigos[$correo]);   // el código sirve una sola vez
            escribirJson('codigos.json', $codigos);
            $acceso = accesoDe($correo);
            if (!$acceso) salir($malo, 401);
            abrirSesion($acceso);
            salir(['ok' => true, 'nombre' => $acceso['nombre'], 'clientes' => $acceso['clientes']]);
        }
        case 'sesion': {
            $a = sesionActual();
            if (!$a) salir(['ok' => false], 401);
            $base = ['ok' => true, 'nombre' => $a['nombre'], 'correo' => $a['correo'], 'demo' => esDemo()];
            if (!empty($a['equipo'])) {
                $base['equipo'] = true;
                $base['opciones'] = opcionesEquipo();
                $comoId = (string)($_GET['como'] ?? '');
                $e = $comoId !== '' ? accesoDeOpcion($comoId) : null;
                $base['clientes'] = $e['clientes'] ?? [];
                $base['grupo'] = !empty($e['grupo']);
                $base['como'] = $e ? $comoId : '';
                salir($base);
            }
            salir($base + ['clientes' => $a['clientes'], 'grupo' => !empty($a['grupo'])]);
        }
        case 'procesos': {
            $a = accesoEfectivo();
            $lista = procesosDe($a, isset($_GET['cliente']) ? (string)$_GET['cliente'] : null);
            salir(['ok' => true, 'clientes' => $a['clientes'], 'total' => count($lista), 'procesos' => $lista]);
        }
        case 'tutelas':
        case 'resumen': {
            $a = accesoEfectivo();
            if (empty($a['grupo'])) salir(['ok' => false, 'error' => 'Esta sección no está disponible para su cuenta.'], 403);
            $cli = isset($_GET['cliente']) ? (string)$_GET['cliente'] : null;
            if ($accion === 'tutelas') { $l = tutelasDe($a, $cli); salir(['ok' => true, 'total' => count($l), 'tutelas' => $l]); }
            salir(['ok' => true, 'resumen' => resumenDe($a, $cli)]);
        }
        case 'valores': {
            $a = accesoEfectivo();
            if (empty($a['grupo'])) salir(['ok' => false, 'error' => 'Esta sección no está disponible para su cuenta.'], 403);
            salir(['ok' => true, 'valores' => valoresDe($a)]);
        }
        case 'salir': {
            if (!$esPost) salir(['error' => 'Método no permitido.'], 405);
            cerrarSesion();
            salir(['ok' => true]);
        }
        default:
            salir(['error' => 'No existe esa acción.'], 404);
    }
} catch (Throwable $e) {
    error_log('portal-clientes: ' . $e->getMessage());
    if ($e instanceof ConfigFaltante) salir(['ok' => false, 'error' => 'El portal todavía no está configurado en el servidor (falta el archivo config.php). Avise al equipo de Lexara.'], 500);
    // El detalle técnico solo se ve en modo demo; el cliente recibe un mensaje general.
    salir(['ok' => false, 'error' => esDemo() ? $e->getMessage() : 'No pudimos completar la consulta. Intente de nuevo en unos minutos.'], 500);
}
