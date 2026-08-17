import { useRef, useEffect } from 'react';

// Tarjeta de campo con etiqueta oscura arriba y valor abajo — mismo formato
// del formulario Access original que se usaba antes, pero con los colores
// institucionales de Lexara en vez de los verdes/teales de Access. Extraída
// de ProcesoDrawer.jsx (2026-08-16) al necesitarla también TutelaDrawer.jsx.
export function FieldCard({ label, full, children }){
  return (
    <div className={"field-card" + (full ? " full" : "")}>
      <div className="field-card-label">{label}</div>
      <div className="field-card-value">{children}</div>
    </div>
  );
}

// Editor de texto enriquecido para columnas de SharePoint con texto
// enriquecido real (negrita/subrayado/resaltado) — un <textarea> plano les
// hace perder el formato. Es "no controlado" (el HTML vive en el propio
// contentEditable, no se vuelve a pintar en cada tecla) para no perder la
// posición del cursor mientras se escribe.
export function RichTextEditor({ value, onChange, readOnly }){
  const ref = useRef(null);
  const focusedRef = useRef(false);

  useEffect(() => {
    if(ref.current && !focusedRef.current && ref.current.innerHTML !== (value || "")){
      ref.current.innerHTML = value || "";
    }
  }, [value]);

  function exec(cmd, arg){
    if(readOnly) return;
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    onChange(ref.current.innerHTML);
  }

  return (
    <div className="richtext">
      {!readOnly && (
        <div className="richtext-toolbar">
          <button type="button" title="Negrita" onMouseDown={e => e.preventDefault()} onClick={() => exec('bold')}><b>N</b></button>
          <button type="button" title="Subrayado" onMouseDown={e => e.preventDefault()} onClick={() => exec('underline')}><u>S</u></button>
          <button type="button" title="Resaltar" onMouseDown={e => e.preventDefault()} onClick={() => exec('hiliteColor', '#fff3b0')}>Resaltar</button>
          <button type="button" title="Quitar formato" onMouseDown={e => e.preventDefault()} onClick={() => exec('removeFormat')}>Limpiar</button>
        </div>
      )}
      <div
        ref={ref}
        className="richtext-body"
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onFocus={() => { focusedRef.current = true; }}
        onBlur={() => { focusedRef.current = false; }}
        onInput={e => onChange(e.currentTarget.innerHTML)}
      />
    </div>
  );
}
