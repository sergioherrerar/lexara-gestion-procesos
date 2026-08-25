// Control de acceso — antes se basaba SOLO en el "Rol" (Administrador/Jefe/
// Colaborador), 3 combinaciones fijas de módulos. Eso no alcanzaba para un
// caso real (una contadora externa que solo debía ver Facturación y Órdenes
// de compra, nada más) — ningún Rol existente daba justo esa combinación.
//
// 2026-08-21: se agregaron 2 columnas nuevas a "Equipo MD" (Colaborador
// Lexara) — "Módulos permitidos" (texto, lista separada por comas de los
// módulos que puede ver esa persona) y "Solo lectura" (Sí/No) — y el control
// de acceso ahora se calcula por PERSONA (su fila completa en Equipo MD), no
// solo por su Rol. El Rol se conserva en la lista como etiqueta informativa
// (para saber el cargo de cada uno) pero ya no decide nada por sí solo,
// excepto como valor de respaldo abajo.
//
// Se cruza por Correo contra la cuenta de Microsoft 365 con la que se inició
// sesión (ver useLexaraApp.js), igual que antes.

// Todos los módulos que se pueden restringir por casilla. Dashboard e
// Informes quedan siempre visibles para cualquiera que haya iniciado sesión
// — son paneles de consulta general, no hace falta una casilla para esos.
export const MODULOS_DISPONIBLES = [
  {key:'procesos', label:'Procesos judiciales'},
  {key:'tutelas', label:'Tutelas'},
  {key:'clientes', label:'Clientes'},
  {key:'facturacion', label:'Solicitud De Factura E.'},
  {key:'ordenesCompra', label:'Órdenes de compra'},
  {key:'administracion', label:'Administración'},
  {key:'setup', label:'Configuración'},
];
const VISTAS_SIEMPRE_VISIBLES = ['dashboard', 'informes'];

// Valor de respaldo SOLO para colaboradores que todavía no tienen nada
// marcado en "Módulos permitidos" (todos los que ya existían antes de este
// cambio) — reproduce exactamente el comportamiento viejo de cada Rol, para
// que nadie pierda acceso el día que esto se publique. En cuanto alguien
// edite y guarde sus módulos desde la app, este respaldo deja de aplicarle
// (ModulosPermitidos ya no estará vacío).
//
// 2026-08-25: el módulo "Colaborador Lexara" se renombró/movió dentro de
// "Administración" (junto con Vacaciones/Certificaciones/Documentos de la
// empresa, ver [[project_administracion_modulo]]) — pedido explícito del
// usuario: "en permisos solo los administradores". Por eso, para alguien SIN
// nada guardado todavía en Módulos permitidos (cae acá, al respaldo por
// Rol), Administración queda SOLO para Administrador — un Jefe nuevo no lo
// vería de entrada, habría que marcarle la casilla a mano. (Quien YA tenía
// "colaboradores" guardado explícitamente sigue viéndolo igual gracias al
// alias conAliasAdministracion() de abajo — no perdió nada con el rename.)
const MODULOS_POR_ROL_LEGADO = {
  Administrador: ['procesos','tutelas','clientes','facturacion','ordenesCompra','administracion','setup'],
  Jefe: ['procesos','tutelas','clientes','facturacion','ordenesCompra'],
  Colaborador: ['procesos','tutelas','clientes'],
};
// Correo que no aparece en Equipo MD: mismo bloqueo de menú que Colaborador
// (el más restringido de los 3 roles reales) — nunca acceso total a ciegas.
const MODULOS_SIN_REGISTRAR = MODULOS_POR_ROL_LEGADO.Colaborador;

export function parseModulosPermitidos(texto){
  return String(texto || "").split(',').map(s => s.trim()).filter(Boolean);
}
export function serializeModulosPermitidos(lista){
  return (lista || []).filter(Boolean).join(',');
}

// 'colaboradores' era la clave vieja del módulo, antes de renombrarlo a
// 'administracion' (ver [[project_administracion_modulo]]) — pero mucha
// gente YA tenía "colaboradores" guardado tal cual en su propia columna real
// de SharePoint "Módulos permitidos" (no dependían del respaldo por Rol).
// Sin este alias esas personas perdían el acceso de la nada — bug real
// reportado 2026-08-25 ("no se ve administración"), incluso para el propio
// Administrador, porque una lista EXPLÍCITA siempre gana sobre el respaldo
// legado (ver modulosPermitidosDe). Se normaliza acá, en un solo lugar, en
// vez de tener que volver a guardar el campo de cada persona en SharePoint.
function conAliasAdministracion(lista){
  return lista.includes('colaboradores') && !lista.includes('administracion')
    ? [...lista, 'administracion']
    : lista;
}

function esVerdadero(v){
  return v === true || v === 1 || (typeof v === 'string' && /^(s[ií]|true|1)$/i.test(v.trim()));
}

// `colaborador` es la fila completa de Equipo MD que hace match por Correo
// con la cuenta que inició sesión (o null si el correo no aparece ahí) —
// ver `colaboradorActual` en useLexaraApp.js.
export function modulosPermitidosDe(colaborador){
  if(!colaborador) return MODULOS_SIN_REGISTRAR;
  const explicitos = parseModulosPermitidos(colaborador.ModulosPermitidos);
  if(explicitos.length) return conAliasAdministracion(explicitos);
  return conAliasAdministracion(MODULOS_POR_ROL_LEGADO[colaborador.Rol] || MODULOS_SIN_REGISTRAR);
}

export function canAccessView(modulosPermitidos, view){
  return VISTAS_SIEMPRE_VISIBLES.includes(view) || (modulosPermitidos || []).includes(view);
}

// Un solo interruptor por persona (no por módulo): si está marcado "Solo
// lectura", puede consultar/imprimir en todo lo que sí puede ver, pero no
// crear/editar/eliminar nada. Un correo sin registrar en Equipo MD nunca
// puede escribir, sin importar nada más.
export function canWrite(colaborador){
  if(!colaborador) return false;
  return !esVerdadero(colaborador.SoloLectura);
}
