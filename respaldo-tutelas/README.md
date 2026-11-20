# Respaldo diario de Tutelas por correo (Lexara)

Cada día laboral, a las **9:30 a. m.**, este programa lee la lista **Tutelas** de SharePoint (solo lee, no cambia nada) y envía un correo a Gmail con:
- las tutelas **pendientes** (no contestadas, con vencimiento hasta 10 días atrás o futuro), ordenadas por vencimiento: **vencidas, vencen hoy, vencen mañana y pasado, con más plazo**;
- un **CSV adjunto** (abre con Excel) con el mismo detalle y más columnas.

Sirve para no quedar a ciegas si Microsoft cae: el correo sale **por Gmail, no por Microsoft**. Si Microsoft está caído, la lista que llega es la última que se pudo leer.

> Se ejecuta a las 9:30 (y opcionalmente a las 3:30 p. m.) y no a las 6 a. m. porque a esa hora todavía no se han cargado todas las tutelas del día al portal.

## Instalar (una sola vez)
1. **Subir la carpeta** a `public_html/respaldo-tutelas/` (cPanel → Administrador de archivos → subir el zip y extraerlo ahí).
2. **Crear `config.php`:** copie `config.example.php` a `config.php` y complete **dos claves** (nunca las pegue en un chat):
   - `client_secret`: el **valor** del secreto «sites» de la app **Lexara-Procesos** (Azure → Certificados y secretos).
   - `gmail_clave_app`: la **clave de aplicación** de Gmail (ver abajo), no la contraseña normal.
3. **Permiso de Microsoft** (una sola vez, lo hace un administrador): la app necesita acceso de lectura al sitio **TutelasMDABOGADOS** (Graph Explorer, `POST /sites/{id}/permissions` con rol `read` o `write` para la aplicación «Lexara-Procesos»; el permiso de aplicación **Sites.Selected** ya está concedido).
4. **Clave de aplicación de Gmail:** entre a `myaccount.google.com/apppasswords` con la cuenta `TutelasLexia@gmail.com` (requiere la verificación en dos pasos activa), cree una con el nombre «Respaldo Tutelas» y copie las 16 letras en `gmail_clave_app`.
5. **Probar:**
   - Correo: `php respaldo.php --probar-correo` → debe llegar un correo corto a Gmail.
   - SharePoint sin enviar: `php respaldo.php --solo-mostrar` → guarda `privado/ultimo-respaldo.html` y `.csv` para revisarlos.
   - Todo junto: `php respaldo.php` → envía el respaldo de verdad.
   - Sin Microsoft (datos de ejemplo): `php respaldo.php --simular=ejemplo.json --solo-mostrar`.
6. **Programar la tarea** en cPanel → *Tareas Cron* (use la ruta de PHP que muestre su cPanel):
   - 9:30 a. m., de lunes a viernes: `30 9 * * 1-5   /usr/local/bin/php /home/lexaraab/public_html/respaldo-tutelas/respaldo.php`
   - (Opcional) 3:30 p. m.: `30 15 * * 1-5   /usr/local/bin/php /home/lexaraab/public_html/respaldo-tutelas/respaldo.php`
   - Revise que la hora del servidor sea la de Colombia: si el correo llega a otra hora, ajuste la hora de la tarea.

## Si algo falla
Mire `privado/respaldo.log`: ahí queda cada ejecución y el error exacto (clave mala, permiso de SharePoint faltante, Gmail rechazó, etc.).

## Seguridad
- `config.php` y `privado/` **nunca** se suben al repositorio (están en `.gitignore`) y el `.htaccess` impide abrirlos desde internet.
- El programa **no** se puede ejecutar desde el navegador (solo por línea de comandos / cron).
- La cuenta de Gmail debe tener verificación en dos pasos.
