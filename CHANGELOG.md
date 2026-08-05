# Historial de cambios

Registro de qué cambió en cada publicación, en orden del más reciente al más antiguo. Para el detalle técnico de un cambio puntual, el mensaje del commit correspondiente en GitHub tiene más contexto.

## 2026-08-05
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
