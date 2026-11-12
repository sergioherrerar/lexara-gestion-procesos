<?php
// Plantilla de configuración de la actualización automática de Lexara al Día.
// En el servidor (cPanel) copie este archivo a "config.php" (sin ".example") y pegue ahí las claves.
// "config.php" NO se sube a GitHub ni se puede abrir desde el navegador.
//
// Sin ninguna clave la actualización ya lee YouTube (canal Café Laboral) y el episodio más reciente de Spotify.
// Cada clave que agregue suma una fuente o más detalle:

return [
    // INSTAGRAM (para leer los reels y publicaciones de @lexaraabogados).
    // Se genera en developers.facebook.com → su app → Instagram → «Generate token». Dura 60 días y el programa la renueva sola.
    'instagram_token' => 'PEGA_AQUI_LA_CLAVE_DE_INSTAGRAM',

    // SPOTIFY (para leer los últimos episodios de Café Laboral y no solo el más reciente). Gratis: developer.spotify.com/dashboard → Create app → Settings.
    'spotify_client_id'     => 'PEGA_AQUI_EL_CLIENT_ID_DE_SPOTIFY',
    'spotify_client_secret' => 'PEGA_AQUI_EL_CLIENT_SECRET_DE_SPOTIFY',
];
