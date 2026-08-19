// Generador del informe formal de la Entidad "Grupo Colmédica": tanto el
// Excel ("FORMATO GRUPO") como el PDF ahora son el formato COMPARTIDO
// "Grupo" (ver informeGrupo.js) — Colpatria usa exactamente el mismo PDF
// desde 2026-08-19 (pedido explícito del usuario: mismas columnas que
// Colmédica). Este archivo queda como los alias con el nombre de Colmédica,
// para no tener que tocar InformesView.jsx.
// Ver CHANGELOG 2026-08-16/2026-08-19 y [[project_informes_modulo]].
export { generarInformeGrupoExcel as generarInformeColmedicaExcel, generarInformeGrupoPDF as generarInformeColmedicaPDF } from './informeGrupo';
