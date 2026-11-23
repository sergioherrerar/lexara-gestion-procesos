<?php
// Plantilla de configuración del RESPALDO DE TUTELAS — NUNCA pongas aquí las claves reales (este archivo sí se sube a GitHub).
// En el servidor (cPanel) copie este archivo a "config.php" (sin ".example") y ahí sí pegue la clave de Microsoft. "config.php" está en .gitignore: no sube al repositorio.

return [
    // ---- Conexión a Microsoft (solo LEE la lista de Tutelas). El Id de aplicación no es secreto; la clave SÍ. ----
    'tenant_id'     => 'a89ceaa6-c4df-4b18-93a7-65dfa57a5541',   // directorio (md abogados sas)
    'client_id'     => '8bf7069f-55e7-47ae-bea2-f1f0aa38657d',   // aplicación «Lexara–Procesos» (la del portal; NO la 3fabf820, que es otra). Debe tener Sites.Selected y permiso «read» al sitio de Tutelas (POST /sites/{id}/permissions)
    'client_secret' => 'PEGA_AQUI_LA_CLAVE_SECRETA',               // el VALOR de un secreto de ESA aplicación (nunca el «Id. de secreto»)

    'sp_host'        => 'mydabogados.sharepoint.com',
    'sitio_tutelas'  => '/sites/TutelasMDABOGADOS',
    'lista_tutelas'  => 'Tutelas',

    // ---- Envío del correo (NO usa Microsoft) ----
    // 'servidor' (recomendado): sale directo del servidor de cPanel, «de» una dirección @lexaraabogados.com. No necesita contraseñas: el SPF de lexaraabogados.com ya incluye la IP del servidor.
    // 'gmail': por el SMTP de Gmail con una clave de aplicación (solo si Google deja crearla; llene las dos líneas de abajo).
    'envio'     => 'servidor',
    'remitente' => 'tutelas@lexaraabogados.com',     // «De» del correo. Con esta dirección, el filtro de Gmail «De: tutelas@…» ya lo pone en la etiqueta Tutelas y lo saca de Spam.
    'nombre_remitente' => 'Respaldo Tutelas Lexara',
    // A quién llega el respaldo. Pueden ser varios (cada uno recibe su copia). OJO: deben ser correos que NO sean de Microsoft (Gmail, etc.) para que lleguen aunque Microsoft esté caído.
    'destinatarios' => ['TutelasLexia@gmail.com'],

    // Solo si 'envio' => 'gmail':
    'gmail_usuario'   => 'TutelasLexia@gmail.com',
    'gmail_clave_app' => 'PEGA_AQUI_LA_CLAVE_DE_APLICACION',
];
