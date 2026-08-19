# Historial de cambios

Registro de qué cambió en cada publicación, en orden del más reciente al más antiguo. Para el detalle técnico de un cambio puntual, el mensaje del commit correspondiente en GitHub tiene más contexto.

## 2026-08-19
- Se cambió el encabezado de TODOS los PDF de la app (Informes por Entidad, ficha de Proceso judicial, informe de Tutelas) para que use el membrete completo real — el mismo que ya usaba la hoja imprimible de Facturas/Órdenes de compra — en vez del logo chico + título propio que tenía antes.
- En Tutelas: contador junto al botón "Nueva tutela" que muestra cuántas tutelas vencen hoy — en rojo si hay alguna, en gris si no. Se recalcula solo con lo que haya cargado en pantalla, siempre al día.
- Corregido: los botones de PDF y Correo del informe diario de Tutelas no hacían nada al hacer clic — "No Tutela" es una columna numérica en SharePoint y el código intentaba tratarla como texto para ordenarla, lo que rompía el botón en silencio. Ya funciona con datos reales.
- Nuevo botón de Excel en el informe de Tutelas: descarga todas las tutelas (no solo las de la fecha elegida) con columnas Id/No Tutela/Cliente/Ciudad/Prestación/Usuario/No Identificación/Fecha Notificación/Vencimiento/Tema/Solicita/Tipo Respuesta/Valor Entidad/Valor Abogado/Abogado Tutela — mismo formato institucional que los demás Excel de Informes.

## 2026-08-18
- "Departamento" y "Ciudad"/"Municipio" ahora son listas desplegables dependientes (departamento → sus municipios reales), con los 32 departamentos de Colombia + Bogotá D.C., en Procesos judiciales y en Tutelas.
- Revisé el resto de campos de Procesos judiciales por el mismo problema del punto anterior (dos campos mostrando el mismo dato dos veces): encontré 6 casos más — Naturaleza del proceso/Subclasificación/Número 5 dígitos/Radicado actual/No. identificación demandante/Enlace proceso/Glosa demandada — y los quité del formulario (siguen existiendo para los informes que ya los usan, como el de SOS). Ninguna otra lista (Tutelas, Clientes, Facturación, Órdenes de compra, Colaborador Lexara, Formas de pago, Desistimientos) tiene este problema.
- Corregido: en el panel de Proceso judicial (pestaña Datos generales, sección Valores) ya no se muestra "Valor cartera actual" duplicado junto a "Valor actual demanda" — en SharePoint son la misma columna, mostrar los dos repetía el mismo valor dos veces. El campo sigue existiendo para el informe de SOS, solo se quitó del formulario.
- En el formulario de Tutela: en Identificación, "Entidad" ahora va antes que "Cliente", y "Prestación" se movió junto a "Tipo Vinculación Entidad" (antes estaba en Trámite).
- Corregido: "Tipo Vinculación Entidad" no depende de nada — es una lista fija propia (Accionada/Vinculada), sin relación con Tema/Prestación (se había armado por error tomando sus opciones de la lista Tema).
- En la tabla de Tutelas: la columna "Juzgado" ya no se estira con nombres largos (se acorta con puntos suspensivos) y se agregó la columna "Tipo Respuesta".
- En el formulario de Tutela: "Prestación" y "Tipo Respuesta" ahora son listas desplegables fijas (Asistencial/Económica/Administrativa; y ACLARACION/ALCANCE/APLAZAMIENTO/CUMPLIMIENTO FALLO/IMPUGNACION/NULIDAD/REQUERIMIENTO/TUTELA). Se agregó el campo "Abogado Respuesta" (lista desplegable: Ariana Martin Mendoza/Mónica Paola Quintero/Daniel Santiago Flechas), que en una tutela nueva arranca en "Ariana Martin Mendoza". El campo "Tema" ahora depende de "Prestación" (antes dependía de "Tipo Vinculación Entidad").
- Se agregó la columna "Observación" a la tabla de Procesos judiciales (entre Estado y Carpeta), con el mismo tamaño de letra y color que la columna Estado.
- Corregido el informe diario de Tutelas: el campo de fecha ahora es "Fecha Notificación" (antes decía "Fecha de Vencimiento" y estaba al revés) — las tutelas Notificadas se filtran por esa fecha elegida, y las de Vencimiento siempre son las de la fecha real de hoy al momento de generar el PDF o el correo. El cuerpo del correo ahora sí trae las dos listas de tutelas (Contestaciones con Vencimiento / Tutelas Asignadas), igual que el correo real de Access que se usó de modelo.
- Nuevo panel "Informe diario de Tutelas" en Informes: se elige la fecha de Vencimiento a reportar (la de Notificación sale sola, el día anterior) y hay dos botones — uno descarga el PDF con las dos tablas (Tutelas Notificadas / Tutelas con Vencimiento, igual formato que el reporte de Access), y el otro abre un borrador en el cliente de correo del equipo (Outlook, si es el predeterminado) con destinatarios y asunto ya listos; el PDF hay que adjuntarlo a mano porque un enlace de correo del navegador no puede adjuntar archivos automáticamente.

## 2026-08-17
- En el formulario de Tutela: se quitó el botón "Valor entidad". "Tipo Vinculación Entidad" y "Tema" ahora son listas desplegables dependientes (igual que Tipo de Acción/Tipo de Proceso en Procesos judiciales) — las opciones de Tipo Vinculación Entidad salen de "Prestación Tema" en la lista Tema, y el Tema se filtra según cuál Tipo Vinculación Entidad esté elegido.
- Corregido: el campo "Cliente" de Tutelas se veía siempre vacío aunque sí tuviera dato en SharePoint — es una columna de tipo Búsqueda, y Microsoft Graph no trae su valor real salvo que se pida explícitamente por nombre. Se agregó esa segunda lectura específica para columnas de Búsqueda/Persona (no afecta a las demás listas, que no tienen ese tipo de columna).
- En la tabla de Tutelas: Fecha Notificación y Fecha Vencimiento ahora se ven en formato corto (antes salía la fecha/hora completa tal cual la entrega SharePoint); se agregó la columna Fecha Notificación, que no se estaba mostrando.
- Corregido el modelo de datos de Tutelas según las columnas reales de SharePoint: "Link Carpeta Tutela" y "Link Carpeta Formatos" no son datos de cada Tutela individual, sino fijos por Entidad — se movieron a Valores Entidad (ahí también se agregaron "Tipo" y "Valor Abogado", que faltaban). El botón "Tema" ahora también reconoce sus columnas reales "Prestación Tema" y "Cliente Tema". El mini-editor "Valor entidad" del formulario de Tutela ahora edita las 5 columnas de Valores Entidad de una vez.
- Corregido: las listas de Tutelas, Tema y Valores Entidad viven en OTRO sitio de SharePoint (no en el sitio principal donde están Procesos/Clientes/etc.) — la aplicación ya sabe conectarse a un sitio distinto por lista, así que estas 3 listas ahora sí se encuentran y se leen/guardan correctamente contra `https://mydabogados.sharepoint.com/sites/TutelasMDABOGADOS`.

## 2026-08-16
- Nuevo módulo "Tutelas" (en el menú, junto a Procesos judiciales): pantalla de lista con los mismos campos del formulario que se usaba en Access (No. Tutela, Cliente, Entidad, Tipo de vinculación, Medida cautelar, Departamento/Ciudad, Juzgado, fechas de Notificación/Vencimiento, Prestación, Tipo de respuesta, Tema, Agencia oficiosa, Usuario, No. de identificación, Correo, Solicita en texto enriquecido) organizados en tarjetas por sección. Dentro del formulario hay dos botones — "Tema" y "Valor entidad" — que abren un mini-editor en línea para crear o corregir esos datos sin salir de la Tutela. Se agregaron 3 listas nuevas a Configuración (Tutelas, Tema, Valores Entidad) con sus campos aún sin mapear a SharePoint — se confirman desde ahí antes de usarlo con datos reales.
- Nuevos botones de Excel en Informes, junto a "Facturación por Entidad" y "Órdenes de compra por Entidad": descargan la lista completa (no filtrada por Entidad) con el mismo estilo institucional de los demás informes.
- Nuevo informe para la Entidad "Grupo Colmédica" (Excel + PDF): el Excel usa el mismo formato "Grupo" que Aliansalud (12 columnas); la carta en PDF trae Número corto, Despacho (con el No. de despacho), Fecha Estado y Estado.
- Nuevo ícono de PDF en la tabla de Procesos judiciales (junto a Ver/Editar): descarga una ficha en PDF de ese proceso individual, con sus datos principales (cliente, entidad, apoderado, despacho, fechas, valor actual, calificación de contingencia) más el Estado y el Histórico completos.
- El PDF genérico de Colpatria/Coomeva/GTM/JRCI/Particulares/Salud Total quitó la columna "Naturaleza del Proceso" para darle más espacio a "Histórico" (ahora: Número corto, Despacho, Histórico).
- El mapeo de columnas de SharePoint (Configuración) se actualizó con el mapeo real y completo que el usuario confirmó y exportó — ya no depende solo de lo guardado en cada navegador; funciona de una en cualquier equipo nuevo.
- Nuevo informe para la Entidad "Aliansalud" (Excel + PDF), con su propio formato: Excel con 12 columnas (No. Completo, Número corto, Despacho Judicial, Demandante, Parte en la que actuamos, Histórico números completos, Demandado, Fecha último estado, Estado, Histórico, Cliente); carta en PDF con Número corto, Despacho (junto con el No. de despacho) y Estado.
- El informe de Famisanar vuelve a su formato original (Excel de 14 columnas y carta en PDF con Número corto/Cuantía Actual/Calificación de la contingencia/Estado/Fecha Estado) — el ajuste anterior era para las OTRAS Entidades, no para Famisanar.
- Nuevo formato genérico de informes (Excel + PDF) para las Entidades que no tienen plantilla propia heredada: **Colpatria, Coomeva, GTM, JRCI, Particulares y Salud Total**. Excel con 16 columnas (No. Completo, Radicado actual, Despacho Judicial, Demandante, Demandado, Parte en la que actuamos, Histórico números completos, Fecha último estado, Estado, Histórico, Cuantía Actual, Calificación de la contingencia, Enlace Proceso, No. Contrato, Link Contrato); carta en PDF con Número corto, Naturaleza del Proceso, Despacho (con el No. de despacho) e Histórico. Cualquier Entidad nueva sin modelo propio usará este mismo formato.
- Nuevo informe para la Entidad "Famisanar" (Excel + PDF), con su propio formato. Se agregaron 2 campos nuevos a Procesos (Radicado actual, Fecha terminación) para completar este informe. De paso, el armado del PDF (membrete, firma, paginación) se organizó para compartirse entre Entidades — la próxima Entidad que necesite su informe será más rápida de agregar.
- Ajustes al PDF del informe SOS: los valores de "No. Radicado" y "Valor Actual Demanda" ya no se parten en dos líneas (letra más chica y columna un poco más ancha en esas dos), y el archivo pesaba una barbaridad (más de 100MB con muchos procesos) — el logo del encabezado se estaba incrustando de más; ahora se reescala y se reutiliza una sola vez en todo el documento sin importar cuántas páginas tenga. Un informe de 48 procesos ahora pesa menos de 100KB.
- Nuevo informe de Desistimientos para la Entidad SOS (ícono junto a Excel/PDF en la tabla de Informes): descarga un Excel con el mismo formato de la plantilla real (numero corto, No. Completo, Histórico números completos, Despacho Judicial, Valor Actual Demanda, Desistimiento Valor, Fecha Radicación, Aprobación, Fecha de Aprobación, Observaciones) — une cada desistimiento con los datos de su proceso automáticamente.
- Corregido: el PDF del informe de SOS salía mal ordenado porque se generaba con la función de imprimir del navegador (varias hojas con el membrete repetido no se comportaban bien al guardar como PDF). Se reconstruyó para que el PDF se genere y se descargue directo, igual que el Excel, sin pasar por el diálogo de impresión.
- El módulo Informes ya genera también la carta en PDF de la Entidad SOS (antes solo estaba el Excel) — mismo texto y columnas del modelo real (No. Radicado/Fecha Estado/Estado/Valor Actual Demanda), con presentación institucional modernizada: encabezado y pie con el membrete de Lexara repetidos en cada hoja, tabla con encabezado verde y filas alternadas, firma al final. Las fechas y el conteo de procesos se calculan solos al momento de generar el informe (siempre la fecha real y la cantidad de procesos vigentes de esa Entidad). En la tabla de Informes, el botón único "Generar informe" se dividió en dos íconos (Excel/PDF).

## 2026-08-14
- El "Numero_Corto" en la tabla de Procesos judiciales ahora resalta más (más grande, en negrita y en verde institucional) — es el identificador principal de un recobro y antes se veía igual de discreto que cualquier otro dato.
- Nuevo módulo "Informes" (en el menú, justo después de Dashboard): resumen por Entidad de Procesos, Clientes, Facturación y Órdenes de compra (gráfica + tabla con procesos activos/total, valor en disputa, facturación y semáforo de Estado). Para la Entidad "SOS" además hay un botón "Generar informe" que descarga el informe en Excel con el mismo formato (columnas, orden y colores institucionales) que ya se usaba en Access. El informe en PDF queda para una siguiente entrega.
- Se agregaron 13 campos nuevos a Procesos judiciales para este informe: Naturaleza del proceso, Subclasificación, Número 5 dígitos, Fecha reforma de demanda, Valor cartera actual, Enlace proceso, Glosa demandada, Departamento, Municipio, No. de identificación demandante, Medida cautelar, Monto medida cautelar y Porcentaje de la calificación. Aparecen en Datos generales/Trazabilidad — todavía sin mapear a SharePoint, se confirman uno a uno desde Configuración.

## 2026-08-08
- Cambió el criterio de color del Estado del proceso (en la tabla y en el panel): antes se adivinaba por palabras dentro del propio texto de Estado (y tenía un error: "vencimiento de términos" se confundía con "Terminado"). Ahora es: si "Estado V/T" = Terminado → gris; si no, según qué tan vieja es "Fecha último estado" — menos de 6 meses → verde, entre 6 meses y 1 año → naranja, más de 1 año → rojo.
- Corregido: al crear/editar una factura, orden de compra, forma de pago o desistimiento desde dentro de un Proceso judicial, ahora al cerrar ese panel se vuelve a abrir el mismo proceso en vez de dejar solo la lista de fondo.
- En Representación: "Abogado encargado" ahora es lista desplegable con los mismos nombres reales de Colaborador Lexara que "Apoderado". Al elegir el Apoderado, "CC Apoderada" se llena sola con su Identificación (solo si el campo estaba vacío o tenía el CC del apoderado anterior — un dato distinto escrito a mano no se pisa).
- El campo "Instancia" ahora es lista desplegable ("Única Instancia"/"Primera instancia"/"Segunda Instancia").
- En Datos generales: "Entidad" ahora es una lista desplegable con los valores reales que ya existen en la lista de Clientes; "Apoderado" toma los nombres reales de Colaborador Lexara; "Parte en que actuamos" y "Estado V/T" pasan a lista fija ("Con el Demandante"/"Con el Demandado" y "VIGENTE"/"TERMINADO"/"EN REVISION").
- Se renombró la pestaña "Trazabilidad fechas" a solo "Trazabilidad".
- Se agregaron a la pestaña "Trazabilidad fechas" del Proceso judicial: "Admitida" y "Prueba Pericial" (lista Sí/No), "Origen/Tipo Glosa" (texto), y se movió "Calificación de contingencia" aquí, ahora como lista desplegable (POSIBLE/PROBABLE/REMOTO) en vez de texto libre.
- Corregido: al guardar un campo de Link y volver a abrir ese mismo proceso, la aplicación se caía por completo con un error en blanco. Era un efecto secundario de la corrección anterior de los Links.
- El aviso de error (cuando algo sale mal) ahora regresa limpio al menú principal en vez de solo recargar la misma dirección.
- Las tablas (Procesos, Clientes, Facturación, Órdenes de compra, Colaborador Lexara) ahora tienen un menú por columna al estilo de las listas de SharePoint: clic en el encabezado para ordenar de la A a la Z / de la Z a la A, o filtrar por texto — reemplaza la fila fija de filtros que había antes.
- Corregido: los campos de Link (Contrato, Cliente, Carpeta, Despacho) del Proceso judicial no leían el enlace real de SharePoint ni guardaban uno nuevo — esas columnas son de tipo "Hipervínculo" en SharePoint y necesitan un formato distinto al texto plano. Ya se lee y se guarda correctamente.
- Las pestañas del panel de Proceso judicial (Datos generales, Trazabilidad fechas, Facturas, etc.) ahora tienen color — la pestaña activa se ve en verde oscuro en vez de solo una rayita debajo. También se le dio color al botón "+ Nuevo cliente" para que combine con los demás botones de "+ Nuevo/a".
- Al guardar un Proceso judicial, ahora solo se envían a SharePoint los campos que realmente cambiaron (antes se reenviaban los 36 campos del formulario aunque solo se tocara uno) — reduce el riesgo de error y, si SharePoint rechaza algo, el aviso ahora indica justo qué campos se intentaron guardar.
- Se quitó "Link Lexara" (era un campo fantasma, duplicado de "Link a la carpeta" — no existe como columna real en SharePoint).
- Protección técnica: si algo falla de forma inesperada, ahora se ve un mensaje de error con el detalle en vez de quedar la pantalla completamente en blanco sin ninguna pista. También se blindó la forma en que se leen los datos de SharePoint, por si alguna columna real viene en un formato distinto al esperado (por ejemplo, un campo de Persona o Búsqueda en vez de texto simple).
- Corregido: el botón para abrir la carpeta (y los demás enlaces con botón de abrir, como los de Contrato/Lexara/Cliente/Despacho) daba error 404 cuando el enlace real de SharePoint no traía "https://" al principio — ahora se completa automáticamente antes de abrirlo.
- Corregido: el inicio de sesión con Microsoft se quedaba en una pestaña en blanco mostrando un código de autenticación en la dirección, sin completar el ingreso — era un problema conocido de la ventana emergente (popup) de Microsoft, que a veces el navegador bloquea o no logra cerrar sola. Se cambió a que la página completa te lleve a Microsoft y te traiga de vuelta, en vez de usar una ventana emergente — debería ser mucho más confiable.
- **Desactivado temporalmente** el bloqueo de inicio de sesión por correo (Colaborador Lexara) — estaba dejando afuera a todas las cuentas, incluidas las autorizadas. Mientras se revisa la causa (probablemente el mapeo de la columna "Correo" en Equipo MD), el inicio de sesión vuelve a funcionar como antes, sin esa restricción.
- Corregido: los campos de Link (Contrato, Lexara, Cliente, Carpeta, Despacho) en el panel de Proceso judicial no llevaban a ningún lado al tocarlos — ahora, si tienen un valor, aparece un botón para abrirlos en una pestaña nueva.
- Corregido: el mapeo de columnas que se confirma en Configuración se perdía al recargar la página o volver a iniciar sesión — ahora queda guardado en el navegador y se aplica automáticamente en el siguiente inicio de sesión, sin tener que repetir Configuración cada vez.
- Los campos "Valor radicación/reforma/actual demanda" ahora se muestran en formato de moneda colombiana, alineados a la derecha.
- Inicio de sesión restringido: ahora solo puede entrar quien ya esté registrado en el módulo "Colaborador Lexara". Si alguien intenta entrar con una cuenta que no está ahí (Hotmail, Outlook, etc.), se le bloquea el acceso por completo y se le pide escribir a Soporte@lexaraabogados.com para solicitar el ingreso.
- Se quitaron de Configuración los campos "Numero corto" (Desistimientos) y "Ciudad" (Clientes) — no existen como columnas reales en esas listas de SharePoint, así que aparecían para siempre como "sin mapear". El resto de su comportamiento en los formularios sigue igual.

## 2026-08-05
- Nueva lista conectada **"Tipos de Acción"**: guía qué combinaciones de Tipo de Acción / Tipo de Proceso / Despacho son válidas. En el panel de cada Proceso judicial, estos 3 campos quedan seguidos y son selects dependientes — al elegir el Tipo de Acción (Administrativo/Civil/Laboral), Tipo de Proceso y Despacho solo muestran las opciones reales de esa categoría.
- Ahora se puede crear un **Nuevo proceso judicial** desde cero (antes solo se podían editar los existentes), con el mismo criterio de siempre: no se guarda en SharePoint hasta darle "Guardar cambios".
- Se cambió la tipografía de vuelta a Fraunces/Inter (la anterior, "Prompt", no convenció).
- En la tabla de Procesos judiciales: nuevo ícono de **"Ver"** (ojo) junto al de "Editar" — abre el proceso completo solo para consultar y copiar datos, sin botón de guardar. "Editar" sigue permitiendo modificar todos los campos de Datos generales y Trazabilidad fechas.
- El panel de cada Proceso judicial ahora ocupa toda la pantalla (antes era un panel lateral) y tiene un botón **"Volver a procesos judiciales"** para regresar a la lista. También se corrigió que la etiqueta de estado se desbordara cuando el texto era largo.
- Nueva tipografía corporativa: se reemplazó Fraunces/Inter por **Prompt** (fuente propia del despacho) en toda la app — títulos, tablas, formularios e impresión de facturas/órdenes de compra.
- En el panel de cada Proceso judicial: nueva pestaña **"Trazabilidad fechas"** que agrupa todas las fechas del proceso en un solo lugar, y la pestaña "Datos generales" ahora usa un formato de tarjetas (etiqueta + valor) más ordenado, con varios campos de la lista real que todavía no tenían un lugar en la app (No. completo, Demandante, Demandado, Links de Contrato/Lexara/Cliente/Despacho, Correo despacho, Valores de radicación/reforma/demanda, etc. — se mapean desde Configuración cuando se confirme la columna real de SharePoint).
- Se agregó el campo **"Histórico"** (bitácora del proceso) que faltaba, junto a "Fecha último estado".
- Los campos "Histórico" y "Observaciones" ahora tienen texto enriquecido (negrita, subrayado, resaltado) en vez de texto plano, igual que en SharePoint.
- Nuevo módulo **"Desistimientos"** (lista real "Desistimientos tabla"), con su propia pestaña dentro del panel de cada Proceso judicial — a diferencia de los demás, se relaciona por ID real del proceso, no por Contrato. Se puede crear un "Nuevo desistimiento" directamente desde ahí.
- Ampliado el panel de cada Proceso judicial (de 520px a 760px) — con 5 pestañas ya quedaba muy apretado. Se quitó el aviso "Desistimientos (próximamente)" del menú, ya que ahora está disponible como pestaña.
- Nuevo módulo **"Formas de pago"** (lista real "Formas de pago" de SharePoint, asociada por Contrato), con su propia pestaña dentro del panel de cada Proceso judicial. Cada registro tiene 6 pagos con Etapa, Valor y si está Cumplida (casilla); el número de Factura de cada pago se calcula solo (busca una factura con el mismo Contrato y la misma Etapa) y se resalta en verde — nunca se pisa un valor ya guardado.
- Dentro del panel de cada Proceso judicial ahora se puede crear directamente una **Nueva factura**, **Nueva orden de compra** o **Nueva forma de pago**, con el Contrato ya lleno.
- Corregido: el nombre de quien inicia sesión no siempre aparecía (mostraba "Usuario" genérico). Ahora se prueban varias fuentes de la cuenta de Microsoft y, si no hay nombre disponible, se arma uno legible desde el correo; también se muestra el correo real debajo del nombre.
- Nuevo módulo **"Colaborador Lexara"** (conectado a la lista "Equipo MD" de SharePoint) y sistema de roles: **Administrador** ve todo, **Jefe** ve todo menos Configuración, **Colaborador** no ve Facturación/Órdenes de compra/Configuración. Un correo que no esté registrado queda solo en modo consulta, sin poder crear/editar/eliminar en ningún módulo. Crear/editar/eliminar colaboradores se hace directamente desde ese mismo módulo, igual que en los demás.
- El panel de cada Proceso judicial ahora tiene pestañas: **Datos generales**, **Facturas** y **Órdenes de compra** (con un contador de cuántas hay relacionadas por Contrato). Al abrir una desde ahí, te lleva directo a su propio panel. Primer paso de varios más por venir (Desistimientos, Audiencias, Términos, etc.).
- Filtros por columna en las tablas de Procesos, Clientes, Facturación y Órdenes de compra: un cuadro de texto debajo de cada encabezado para filtrar solo esa columna, con un enlace para limpiarlos.
- Corregido el orden de Facturación: las numeraciones simples (300, 301… 805) quedan arriba de mayor a menor, y las que tienen letra (1a, 169a, 193a…) quedan abajo — antes se mezclaban por un error al comparar números con letras.
- Nuevo botón "Generar factura" en cada orden de compra: crea un borrador de factura con los mismos datos (cliente, contrato, proceso, etapa, líneas de detalle), solo con la fecha de hoy en vez de la fecha de la orden. Sigue sin guardarse en SharePoint hasta darle "Guardar cambios".
- Se agregó `CHANGELOG.md` para llevar este registro de cambios.
- Modernización general de la app: los avisos de error y las confirmaciones (por ejemplo, "¿eliminar cliente?") ya no usan los cuadros feos del navegador, ahora tienen el estilo de Lexara.
- Los botones de Guardar/Eliminar/Iniciar sesión avisan "Guardando…" mientras trabajan, para que no se pueda hacer doble clic por accidente.
- El Dashboard ahora muestra 4 tarjetas (se agregaron Clientes y Facturación/Órdenes de compra).
- Se unificó cómo se ven las etiquetas de estado (Procesos y Facturas ya usan el mismo estilo).
- El menú, los filtros y las filas de las tablas ya se pueden usar con teclado, y la tecla Escape cierra cualquier formulario abierto.
- Ajustes menores de espaciado y limpieza de código sin uso.

## 2026-08-03
- Corregido: no se podía guardar una Orden de compra por un campo ("Factura") que resultó ser de solo lectura en SharePoint.
- El campo de búsqueda ahora se limpia solo al cambiar de sección del menú.

## 2026-08-02
- Nuevo módulo: **Órdenes de compra** — mismo tipo de formulario e impresión que Facturación, con su propio número (igual al ID), cruce automático con la factura relacionada, y diseño impreso diferenciado con los colores institucionales (verde claro y naranja).
- Corregido: en pantallas anchas desaparecían columnas de la tabla de Facturación.
- Corregido: en celular no se podía desplazar las tablas hacia la derecha para ver todo el contenido.

## 2026-08-01
- Se agregó la columna "Estado de factura" a la tabla de Facturación.
- Corregido: el membrete y el código QR no aparecían al imprimir una factura (problema de tiempos de carga de las imágenes).
- Se usa el membrete oficial real como fondo de la factura impresa, con Ciudad completada por defecto.

## 2026-07-31
- Rediseño del documento impreso de Facturación: usa el membrete oficial de Lexara como fondo, con pie de página propio (contacto + redes + código QR) en vez de la barra amarilla original.
- Corregido: se generaban decenas de páginas en blanco al imprimir una factura.
- Mejoras en la distribución de las líneas de detalle y los totales.
- Se agregó ciudad del cliente (editable) y autocompletado del proceso al elegir un contrato.
- Corrección de columnas calculadas por SharePoint (Fecha, Totales, IVA) y de la numeración de factura.

## 2026-07-29
- Se agregó el módulo de **Facturación** (formulario tipo factura imprimible, con líneas de detalle y totales).
- Iconos modernos en vez de botones de texto para Editar/Eliminar/Abrir/Nuevo.
- La app se volvió responsiva para celular (menú deslizable, formularios de una columna).
- Botón para actualizar datos desde SharePoint sin tener que volver a iniciar sesión.
- Se usa el logo real del despacho.
- Filtros y orden más claros en Procesos y Clientes.

## 2026-07-28
- Migración completa de la app a React, manteniendo el mismo diseño y funcionalidad, pero con código más ordenado y fácil de mantener.

## 2026-07-27
- Reestructuración inicial con arquitectura genérica para conectar cualquier lista de SharePoint.
- Se agregó la vista de **Clientes**, con relación a Procesos judiciales.

## 2026-07-23
- Primera versión de la app: Procesos judiciales, Dashboard con gráficos, conexión a SharePoint vía Microsoft 365.
