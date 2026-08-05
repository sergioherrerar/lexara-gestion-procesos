// Control de acceso por Rol — el Rol viene de la lista "Equipo MD"
// (Colaborador Lexara), cruzado por Correo contra la cuenta de Microsoft 365
// con la que se inició sesión (ver useLexaraApp.js).
//
// Reglas confirmadas por el usuario:
// - Administrador: acceso a todo.
// - Jefe: todo menos Configuración.
// - Colaborador: no puede entrar a Facturación, Órdenes de compra ni Configuración.
// - Correo que NO aparece en Equipo MD (rol = null/desconocido): mismo bloqueo
//   de menú que Colaborador, y ADEMÁS solo puede ver — nada de crear, editar
//   ni eliminar en ningún módulo (ver canWrite).
const RECOGNIZED_ROLES = ['Administrador', 'Jefe', 'Colaborador'];
const RESTRICTED_VIEWS = {
  Administrador: [],
  Jefe: ['setup'],
  Colaborador: ['facturacion', 'ordenesCompra', 'setup'],
};

export function restrictedViewsForRole(rol){
  // Rol no reconocido (incluye null / sin registrar): mismo bloqueo que
  // Colaborador — el más restringido de los roles reales — nunca acceso total.
  return RESTRICTED_VIEWS[rol] || RESTRICTED_VIEWS.Colaborador;
}

export function canAccessView(rol, view){
  return !restrictedViewsForRole(rol).includes(view);
}

// Solo los 3 roles reconocidos pueden crear/editar/eliminar. Cualquier otro
// caso (correo sin registrar en Equipo MD) queda en solo-lectura en todas
// partes, incluso en las secciones que sí puede ver.
export function canWrite(rol){
  return RECOGNIZED_ROLES.includes(rol);
}
