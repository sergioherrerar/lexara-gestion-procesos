# Respaldo diario de Tutelas por correo (Lexara)

Cada día laboral, a las **9:30 a. m.**, este programa lee la lista **Tutelas** de SharePoint (solo lee, no cambia nada) y envía un correo a Gmail con:
- las tutelas **pendientes** (no contestadas, con vencimiento hasta 10 días atrás o futuro), ordenadas por vencimiento: **vencidas, vencen hoy, vencen mañana y pasado, con más plazo**;
- un **CSV adjunto** (abre con Excel) con el mismo detalle y más columnas.

Sirve para no quedar a ciegas si Microsoft cae: el correo sale **directo del servidor de cPanel hacia Gmail, sin pasar por Microsoft** y sin contraseñas de Gmail. Si Microsoft está caído, la lista que llega es la última que se pudo leer.

> Se ejecuta a las 9:30 (y opcionalmente a las 3:30 p. m.) y no a las 6 a. m. porque a esa hora todavía no se han cargado todas las tutelas del día al portal.

## Instalar (una sola vez)
1. **Subir la carpeta** a `public_html/respaldo-tutelas/` (cPanel → Administrador de archivos → subir el zip y extraerlo ahí).
2. **Crear `config.php`:** copie `config.example.php` a `config.php` y complete **una sola clave** (nunca la pegue en un chat): `client_secret`, el **valor** del secreto «sites» de la app **Lexara-Procesos** (Azure → Certificados y secretos). El correo sale por el servidor (`envio` = `servidor`), así que no hace falta ninguna clave de Gmail.
3. **Permiso de Microsoft** (una sola vez, lo hace un administrador): la app necesita acceso de lectura al sitio **TutelasMDABOGADOS** (Graph Explorer, `POST /sites/{id}/permissions` con rol `read` o `write` para la aplicación «Lexara-Procesos»; el permiso de aplicación **Sites.Selected** ya está concedido).
4. **Por qué sale bien el correo del servidor:** el registro SPF de lexaraabogados.com ya incluye la IP del servidor de cPanel (190.8.176.243) y el DMARC es «quarantine», así que Gmail lo recibe como correo legítimo «de» tutelas@lexaraabogados.com. (Si algún día Google deja crear una clave de aplicación, se puede cambiar a `envio` = `gmail`.)
5. **Probar:**
   - Correo: `php respaldo.php --probar-correo` → debe llegar un correo corto a Gmail (revise también Spam la primera vez).
   - SharePoint sin enviar: `php respaldo.php --solo-mostrar` → guarda `privado/ultimo-respaldo.html` y `.csv` para revisarlos.
   - Todo junto: `php respaldo.php` → envía el respaldo de verdad.
   - Sin Microsoft (datos de ejemplo): `php respaldo.php --simular=ejemplo.json --solo-mostrar`.
6. **Programar la tarea** en cPanel → *Tareas Cron* (use la ruta de PHP que muestre su cPanel):
   - 9:30 a. m., de lunes a viernes: `30 9 * * 1-5   /usr/local/bin/php /home/lexaraab/public_html/respaldo-tutelas/respaldo.php`
   - (Opcional) 3:30 p. m.: `30 15 * * 1-5   /usr/local/bin/php /home/lexaraab/public_html/respaldo-tutelas/respaldo.php`
   - Revise que la hora del servidor sea la de Colombia: si el correo llega a otra hora, ajuste la hora de la tarea.

## Si algo falla
Mire `privado/respaldo.log`: ahí queda cada ejecución y el error exacto (clave mala, permiso de SharePoint faltante, el servidor no aceptó el correo, etc.). Si Gmail rechaza un correo del servidor, el aviso de rebote llega al buzón tutelas@lexaraabogados.com..

## Seguridad
- `config.php` y `privado/` **nunca** se suben al repositorio (están en `.gitignore`) y el `.htaccess` impide abrirlos desde internet.
- El programa **no** se puede ejecutar desde el navegador (solo por línea de comandos / cron).
- La cuenta de Gmail que recibe el respaldo debe tener verificación en dos pasos.
- El único secreto que vive en el servidor es el de Microsoft (solo lectura del sitio de Tutelas).
