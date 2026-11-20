<?php
// Plantilla de configuración del RESPALDO DE TUTELAS — NUNCA pongas aquí las claves reales (este archivo sí se sube a GitHub).
// En el servidor (cPanel) copie este archivo a "config.php" (sin ".example") y ahí sí pegue las claves. "config.php" está en .gitignore: no sube al repositorio.

return [
    // ---- Conexión a Microsoft (solo LEE la lista de Tutelas). El Id de aplicación no es secreto; la clave SÍ. ----
    'tenant_id'     => 'a89ceaa6-c4df-4b18-93a7-65dfa57a5541',   // directorio (md abogados sas)
    'client_id'     => '3fabf820-a9c2-4174-9de6-0a87f12968b4',   // aplicación «Lexara-Procesos»
    'client_secret' => 'PEGA_AQUI_LA_CLAVE_SECRETA',               // el VALOR del secreto «sites», no su ID

    'sp_host'        => 'mydabogados.sharepoint.com',
    'sitio_tutelas'  => '/sites/TutelasMDABOGADOS',
    'lista_tutelas'  => 'Tutelas',

    // ---- Gmail de contingencia (envía el correo; NO usa Microsoft). Se necesita una «clave de aplicación» de Google (16 letras), NO la contraseña normal. ----
    'gmail_usuario'   => 'TutelasLexia@gmail.com',
    'gmail_clave_app' => 'PEGA_AQUI_LA_CLAVE_DE_APLICACION',
    // A quién llega el respaldo (por defecto, a la misma cuenta de Gmail). Puede agregar más correos, p. ej. los de Sergio y Ariana.
    'destinatarios'   => ['TutelasLexia@gmail.com'],
    'nombre_remitente' => 'Respaldo Tutelas Lexara',
];
