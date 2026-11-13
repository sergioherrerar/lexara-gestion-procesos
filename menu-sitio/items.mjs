// Menú principal de www.lexaraabogados.com (copiado del sitio el 2026-11-13) para repetirlo igual en el inicio de cada sección:
// Portal de clientes, Portal Lexara (esta app), Lexara al Día y Redes Sociales. Si el menú del sitio cambia, se cambia SOLO aquí y se corre `node menu-sitio/generar.mjs`.
export const SITIO = 'https://www.lexaraabogados.com';

export const ITEMS = [
  { clave: 'inicio', etiqueta: 'Inicio', url: SITIO + '/' },
  { clave: 'quienes', etiqueta: '¿Quiénes somos?', url: SITIO + '/quienes-somos' },
  {
    clave: 'servicios', etiqueta: 'Servicios', url: SITIO + '/#servicios',
    sub: [
      { etiqueta: 'Representación Judicial', url: SITIO + '/servicios-representacion-judicial/' },
      { etiqueta: 'Asesoría y consultoría', url: SITIO + '/asesoria-y-consultoria/' },
      { etiqueta: 'Auditoría legal laboral', url: SITIO + '/auditoria-legal-laboral/' },
      { etiqueta: 'Cobro de Cartera', url: SITIO + '/cobro-de-cartera/' },
      { etiqueta: 'Capacitación', url: SITIO + '/capacitacion/' },
    ],
  },
  { clave: 'portal-clientes', etiqueta: 'Portal Clientes', url: SITIO + '/portal-clientes/' },
  { clave: 'portal-lexara', etiqueta: 'Portal lexara', url: SITIO + '/app/lexara-gestion-procesos.html' },
  { clave: 'lexara-al-dia', etiqueta: 'Lexara al Día', url: SITIO + '/lexara-al-dia/' },
  { clave: 'redes', etiqueta: 'Redes Sociales', url: SITIO + '/links/' },
];
