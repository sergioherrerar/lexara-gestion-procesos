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
  refresh: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 0 1-15.3 6.4M3 12a9 9 0 0 1 15.3-6.4"/><path d="M21 3v6h-6"/><path d="M3 21v-6h6"/>
    </svg>
  ),
  print: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
    </svg>
  ),
};

// Botón compacto de solo ícono, para acciones repetidas en filas de tabla.
export default function IconButton({ icon, variant = 'edit', label, href, onClick, spinning }){
  const cls = `icon-btn icon-btn-${variant}` + (spinning ? ' icon-btn-spinning' : '');
  if(href){
    return (
      <a className={cls} href={href} target="_blank" rel="noopener noreferrer" title={label} aria-label={label} onClick={onClick}>
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
export function IconTextButton({ icon, variant = 'primary', children, onClick, style }){
  const base = variant === 'primary' ? 'btn-primary' : 'btn-secondary';
  return (
    <button type="button" className={base} onClick={onClick} style={{display:'inline-flex', alignItems:'center', gap:7, ...style}}>
      <span style={{width:14, height:14, display:'inline-flex'}}>{ICONS[icon]}</span>
      {children}
    </button>
  );
}
