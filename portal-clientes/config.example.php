<?php
// Plantilla de configuración del PORTAL DE CLIENTES — NUNCA pongas aquí la clave real (este archivo sí se sube a GitHub).
// En el servidor (cPanel) copia este archivo a "config.php" (sin ".example") y ahí sí pega la clave secreta de Azure.
// "config.php" está en .gitignore: no sube al repositorio.

return [
    // 'demo' = datos de ejemplo, el código de ingreso aparece en pantalla (SOLO para probar, sin Microsoft).
    // 'real' = lee SharePoint con la clave de abajo y manda el código por correo.
    'modo' => 'demo',

    // ---- Conexión a Microsoft (solo modo 'real'). El Id de aplicación no es secreto; la clave SÍ: solo va en config.php. ----
    'tenant_id'     => 'a89ceaa6-c4df-4b18-93a7-65dfa57a5541',   // directorio (md abogados sas)
    'client_id'     => '3fabf820-a9c2-4174-9de6-0a87f12968b4',
    'client_secret' => 'PEGA_AQUI_LA_CLAVE_SECRETA',               // el VALOR de la clave, no su ID

    'sp_host'       => 'mydabogados.sharepoint.com',
    'sitio_procesos' => '/sites/NuevosProcesosMD',
    'lista_procesos' => 'Procesos Judiciales',
    // Quién entra se decide en la lista Clientes (la de siempre): quien tenga su correo en la columna CORREO de un cliente entra y ve los procesos de la
    // Entidad de ese cliente (Grupo Colmédica = sus tres clientes, con selector). Más personas: más correos en esa celda, separados por «;».
    'lista_clientes' => 'Clientes',

    // Equipo de Lexara: estos correos (por dominio, o uno por uno) reciben el código y, al entrar, eligen un cliente para VER el portal como lo ve ese cliente.
    'dominios_lexara' => ['lexaraabogados.com'],
    'correos_lexara'  => [],

    // Entidades que se ven como GRUPO: quien esté en un cliente de esa Entidad ve todos sus clientes, con resumen estadístico y tutelas.
    // Cualquier otra Entidad (particulares, empresas sueltas) = cada cliente ve SOLO lo suyo.
    'entidades_grupo' => ['GRUPO COLMEDICA'],

    // Tutelas (otro sitio de SharePoint).
    'sitio_tutelas' => '/sites/TutelasMDABOGADOS',
    'lista_tutelas' => 'Tutelas',

    // Correo desde el que sale el código (debe existir en tu Microsoft 365).
    'correo_envio' => 'soporte@lexaraabogados.com',

    // Minutos que vale el código y horas que dura la sesión.
    'codigo_minutos' => 10,
    'sesion_horas'   => 8,
];
