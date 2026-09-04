import miniVerdeOscuro from '../assets/Mini verde oscuro.png';

export const ICONS = {
  edit: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>
  ),
  delete: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>
    </svg>
  ),
  add: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14"/>
    </svg>
  ),
  open: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/>
    </svg>
  ),
  // Logo real de Lexara (no un ícono genérico de flechas) — pedido explícito
  // del usuario 2026-08-22, para que el mismo mark que gira mientras carga
  // los datos de SharePoint sea la marca del despacho.
  refresh: <img src={miniVerdeOscuro} alt="" />,
  print: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
    </svg>
  ),
  // Documento con un "+" — generar una factura nueva a partir de esta orden de compra.
  invoice: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 11v6M9 14h6"/>
    </svg>
  ),
  // Ojo — abrir un registro solo para consultar/copiar datos, sin poder editarlo.
  view: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  // Hoja de cálculo — descargar el informe en Excel.
  excel: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13l4 6M12 13l-4 6"/>
    </svg>
  ),
  // Documento — descargar/imprimir el informe en PDF.
  pdf: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 17v-4h1.5a1.5 1.5 0 0 1 0 3H9"/><path d="M13.5 17v-4H15"/><path d="M13.5 15H15"/>
    </svg>
  ),
  // Documento con check — descargar el informe de Desistimientos.
  checklist: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="m9 13 1.5 1.5L13.5 11"/><path d="M9 17.5h6"/>
    </svg>
  ),
  // Sobre — abrir un borrador de correo (Outlook) con destinatarios y asunto listos.
  mail: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 6 10 7 10-7"/>
    </svg>
  ),
  // Ventana de navegador con flecha de descarga — exportar a un .html
  // autocontenido e interactivo (Dashboard por Entidad).
  html: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 9h20"/><path d="M12 13v6m0 0l-2.5-2.5M12 19l2.5-2.5"/>
    </svg>
  ),
  // Documento con "W" — exportar el Dashboard por Entidad a un .docx formal
  // (estático, con las gráficas pegadas como imagen).
  word: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13l1.3 6L11 14l1.7 5L14 13"/>
    </svg>
  ),
  // Dos hojas superpuestas — duplicar un registro (Tutelas: varios casos
  // reales comparten los mismos datos y solo cambian de Cliente/Entidad).
  duplicate: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  ),
  // Tarjeta — abrir el portal de pagos (Davivienda) en una pestaña nueva.
  pay: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/>
    </svg>
  ),
  // Glifo de WhatsApp (teléfono dentro del globo) — compartir por WhatsApp
  // (abre wa.me con el mensaje ya redactado; el usuario elige a quién/qué
  // grupo se lo manda desde su propio WhatsApp). Pedido explícito del
  // usuario 2026-09-04 ("busca el icono de whatsApp", "no ese de mensaje")
  // — se reemplazó el globo genérico por el ícono real y reconocible.
  whatsapp: (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm5.71 14.26c-.24.68-1.4 1.3-1.93 1.38-.5.08-1.14.11-1.84-.12-.42-.13-.97-.32-1.66-.63-2.93-1.27-4.84-4.24-4.99-4.44-.15-.2-1.2-1.59-1.2-3.04 0-1.44.75-2.15 1.02-2.44.27-.29.58-.36.78-.36l.56.01c.18.01.42-.07.66.5.24.58.83 2.01.9 2.16.07.15.12.32.02.52-.1.19-.15.31-.29.48-.15.17-.31.38-.44.51-.15.15-.3.31-.13.6.17.29.75 1.24 1.61 2 1.11.99 2.04 1.29 2.34 1.44.3.15.47.13.65-.08.18-.2.75-.87.95-1.17.2-.29.4-.24.68-.14.28.1 1.77.83 2.07.99.3.15.5.23.57.36.08.13.08.75-.16 1.43z"/>
    </svg>
  ),
};

// Muchos links vienen de SharePoint sin "https://" delante (o con espacios
// de sobra) — como href relativo, el navegador los busca dentro de este
// mismo sitio (GitHub Pages) y da 404 en vez de abrir la página real.
function normalizeHref(href){
  const url = (href||"").trim();
  if(!url) return url;
  return /^([a-z][a-z0-9+.-]*:|\/)/i.test(url) ? url : `https://${url}`;
}

// Botón compacto de solo ícono, para acciones repetidas en filas de tabla.
export default function IconButton({ icon, variant = 'edit', label, href, onClick, spinning }){
  const cls = `icon-btn icon-btn-${variant}` + (spinning ? ' icon-btn-spinning' : '');
  if(href){
    return (
      <a className={cls} href={normalizeHref(href)} target="_blank" rel="noopener noreferrer" title={label} aria-label={label} onClick={onClick}>
        {ICONS[icon]}
      </a>
    );
  }
  return (
    <button type="button" className={cls} title={label} aria-label={label} onClick={onClick} disabled={spinning}>
      {ICONS[icon]}
    </button>
  );
}

// Botón con ícono + texto, para acciones destacadas (formularios, pies de panel).
export function IconTextButton({ icon, variant = 'primary', children, onClick, style, disabled }){
  const base = variant === 'primary' ? 'btn-primary' : 'btn-secondary';
  return (
    <button type="button" className={base} onClick={onClick} disabled={disabled} style={{display:'inline-flex', alignItems:'center', gap:7, ...style}}>
      <span style={{width:14, height:14, display:'inline-flex'}}>{ICONS[icon]}</span>
      {children}
    </button>
  );
}
