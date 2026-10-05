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
// `alFinal` (Histórico del proceso): lo nuevo se agrega al FINAL de la bitácora,
// pero el cuadro tiene alto máximo con scroll interno — con un Histórico largo
// el usuario abría el proceso y no veía el cambio recién guardado (reportado
// 2026-10-05). Con `alFinal` el cuadro se abre desplazado hasta las últimas
// líneas y es más alto.
// Pegar en el Histórico/Observaciones (reportado 2026-10-05: "cuando pego una fecha en el
// campo Histórico sale con caracteres raros"). Al pegar desde Excel, Word, correos o páginas web
// llegan caracteres invisibles o raros (espacios duros U+00A0, de ancho cero, marcas de dirección,
// guiones suaves, "�") y el formato de origen (fuente, color, tamaño). Se pega SOLO TEXTO, limpio.
const ESPACIOS_RAROS = new Set([0x09, 0xA0, 0x1680, 0x202F, 0x205F, 0x3000]);
for(let c = 0x2000; c <= 0x200A; c++) ESPACIOS_RAROS.add(c);
const INVISIBLES = new Set([0xAD, 0xFEFF, 0xFFFD]);
for(let c = 0x200B; c <= 0x200F; c++) INVISIBLES.add(c);
for(let c = 0x202A; c <= 0x202E; c++) INVISIBLES.add(c);
for(let c = 0x2060; c <= 0x2064; c++) INVISIBLES.add(c);
export function limpiarTextoPegado(texto){
  let salida = "";
  for(const ch of String(texto ?? "").replace(/\r\n?/g, "\n")){
    const c = ch.codePointAt(0);
    if(ESPACIOS_RAROS.has(c)) salida += " ";
    else if(INVISIBLES.has(c) || (c < 32 && c !== 10)) continue;
    else salida += ch;
  }
  return salida;
}
function escaparHtml(t){ return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
// Lo que se guarda: los espacios duros (&nbsp;) que el navegador mete al escribir dos espacios
// seguidos o uno al final se vuelven espacios normales.
function htmlLimpio(html){
  return String(html ?? "").replace(/&nbsp;/g, " ").split(String.fromCharCode(160)).join(" ");
}

export function RichTextEditor({ value, onChange, readOnly, alFinal }){
  const ref = useRef(null);
  const focusedRef = useRef(false);

  function handlePegar(e){
    if(readOnly) return;
    e.preventDefault();
    const texto = limpiarTextoPegado(e.clipboardData?.getData('text/plain'));
    if(!texto) return;
    const lineas = texto.split("\n");
    if(lineas.length === 1) document.execCommand('insertText', false, texto);
    else document.execCommand('insertHTML', false, lineas.map(l => `<div>${l ? escaparHtml(l) : "<br>"}</div>`).join(""));
    onChange(htmlLimpio(ref.current.innerHTML));
  }

  useEffect(() => {
    if(ref.current && !focusedRef.current && ref.current.innerHTML !== (value || "")){
      ref.current.innerHTML = value || "";
    }
    if(alFinal && ref.current && !focusedRef.current){
      const el = ref.current;
      el.scrollTop = el.scrollHeight;
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    }
  }, [value, alFinal]);

  function exec(cmd, arg){
    if(readOnly) return;
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    onChange(htmlLimpio(ref.current.innerHTML));
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
        className={"richtext-body" + (alFinal ? " richtext-body-largo" : "")}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onFocus={() => { focusedRef.current = true; }}
        onBlur={() => { focusedRef.current = false; }}
        onPaste={handlePegar}
        onInput={e => onChange(htmlLimpio(e.currentTarget.innerHTML))}
      />
    </div>
  );
}
