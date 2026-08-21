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
