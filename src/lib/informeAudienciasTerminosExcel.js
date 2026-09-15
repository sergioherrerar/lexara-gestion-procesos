// Excel de Audiencias/Términos agrupado por Número Corto (Radicado) — pedido
// explícito del usuario 2026-09-15. Misma técnica de "outline" de Excel
// (grupos colapsables +/-) ya usada en "Tutelas por Abogado" (ver
// informeAbogadosTutelas.js/construirHojaPorAbogado): la fila del proceso
// siempre visible, las filas de Audiencia/Término debajo colapsables.
import { COLOR_ENCABEZADO_XLSX } from './informeTutelas';
import { diasHabilesRestantes, etiquetaCuentaRegresiva, sumarDiasHabilesJudiciales } from './audienciasTerminos';

function soloFechaISO(v){ return String(v || "").slice(0, 10); }

function fechaCorta(iso){
  if(!iso) return "—";
  const [y,m,d] = String(iso).slice(0,10).split('-');
  return `${d}/${m}/${y}`;
}

// Junta Audiencias + Términos, cada uno con su Proceso y fecha objetivo, y
// los agrupa por proceso (por ID — mismo criterio ya usado en toda esta
// pantalla, ver [[project_desistimientos_data_model]]). Los procesos sin
// ningún registro asociado no aparecen. Dentro de cada proceso, las filas
// quedan ordenadas por fecha (lo más próximo primero); los procesos, por
// Número Corto.
export function agruparAudienciasTerminosPorProceso(audiencias, terminos, procesos){
  const porProceso = new Map();
  function agregar(registros, tipoLabel){
    (registros||[]).forEach(r => {
      const proceso = (procesos||[]).find(p => String(p.id) === String(r.Proceso)) || null;
      const fechaObjetivo = tipoLabel === 'Audiencia'
        ? soloFechaISO(r.FechaAudiencia)
        : (soloFechaISO(r.VencimientoTermino) || sumarDiasHabilesJudiciales(soloFechaISO(r.FechaNotificacion), r.DiasHabiles));
      const clave = proceso ? proceso.id : `sin-proceso:${r.id}`;
      if(!porProceso.has(clave)) porProceso.set(clave, { proceso, filas: [] });
      porProceso.get(clave).filas.push({
        tipo: tipoLabel,
        descripcion: r.Descripcion || '',
        fechaObjetivo,
        abogado: r.Abogado || '',
        restantes: fechaObjetivo ? diasHabilesRestantes(fechaObjetivo) : null,
      });
    });
  }
  agregar(audiencias, 'Audiencia');
  agregar(terminos, 'Término');
  const grupos = Array.from(porProceso.values());
  grupos.forEach(g => g.filas.sort((a,b) => (a.fechaObjetivo||'').localeCompare(b.fechaObjetivo||'')));
  grupos.sort((a,b) => (a.proceso?.Radicado || '').localeCompare(b.proceso?.Radicado || ''));
  return grupos;
}

function construirHojaAudienciasTerminos(wb, grupos){
  const ws = wb.addWorksheet("Audiencias y Términos");
  ws.columns = [{width:26},{width:14},{width:38},{width:14},{width:22},{width:24}];
  ws.properties.outlineProperties = { summaryBelow: true, summaryRight: false };

  const headerRow = ws.addRow(["Proceso","Tipo","Descripción","Fecha","Cuenta regresiva","Abogado"]);
  headerRow.height = 26;
  headerRow.eachCell(cell => {
    cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb: COLOR_ENCABEZADO_XLSX} };
    cell.font = { name:'Aptos Narrow', size:11, bold:true, color:{argb:'FFFFFFFF'} };
    cell.alignment = { horizontal:'center', vertical:'middle' };
  });
  ws.autoFilter = 'A1:F1';

  grupos.forEach(g => {
    const encabezado = g.proceso ? `${g.proceso.Radicado || '—'}${g.proceso.Cliente ? ' — ' + g.proceso.Cliente : ''}` : '(sin proceso asociado)';
    const filaProceso = ws.addRow([encabezado, "", "", "", "", ""]);
    filaProceso.font = { name:'Aptos Narrow', size:11, bold:true, color:{argb:'FF004941'} };

    g.filas.forEach(f => {
      const fila = ws.addRow(["", f.tipo, f.descripcion, fechaCorta(f.fechaObjetivo), etiquetaCuentaRegresiva(f.restantes), f.abogado || "—"]);
      fila.outlineLevel = 1;
      fila.getCell(4).alignment = { horizontal:'right' };
    });
  });

  ws.views = [{ state:'frozen', ySplit:1 }];
  return ws;
}

// Genera y descarga el Excel completo (una sola hoja, agrupada por Proceso).
export async function generarAudienciasTerminosExcel(audiencias, terminos, procesos){
  const { default: ExcelJS } = await import('exceljs');
  const grupos = agruparAudienciasTerminosPorProceso(audiencias, terminos, procesos);

  const wb = new ExcelJS.Workbook();
  construirHojaAudienciasTerminos(wb, grupos);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Audiencias y Terminos.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
