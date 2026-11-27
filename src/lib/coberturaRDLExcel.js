// Excel de «Cobertura RDL» (2026-11-27): una hoja por lista, para llevarle a RDL con las fechas y el enlace a su propia carpeta de Drive.
import { COLOR_ENCABEZADO } from './informeSOS';

function encabezar(ws, columnas){
  ws.columns = columnas;
  ws.getRow(1).eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_ENCABEZADO } };
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}
const dma = f => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(f || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const num = p => (p && (p.NoCompleto || p.Radicado)) || '';

export async function generarExcelCobertura(nombreArchivo, r, mes, extra, opciones){
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const S = r.resumen;

  const wr = wb.addWorksheet('Resumen');
  encabezar(wr, [{ header: 'Concepto', key: 'c', width: 62 }, { header: 'Cantidad', key: 'n', width: 14 }]);
  [
    [`Periodo comparado: ${dma(mes.ini)} al ${dma(mes.hasta || mes.fin)}`, ''],
    ['Informes diarios de RDL leídos', S.informesLeidos],
    ['Procesos que RDL reportó en esos informes', S.procesosReportadosPorRDL],
    ['Procesos vigentes comparados contra la Rama', S.procesosVigentesComparados],
    ['Actuaciones importantes en la Rama en el periodo', S.importantesEnRama],
    ['… reportadas por RDL a tiempo', S.reportadas],
    ['… reportadas tarde (más de 2 días hábiles)', S.tardias],
    ['… NO reportadas por RDL (pasaron 2 días hábiles)', S.noReportadas],
    ['… aún dentro del plazo de 2 días hábiles', S.enPlazo],
    ['Procesos con novedades importantes y NINGUNA novedad de RDL en el periodo', S.sinNovedadRDL],
    ['Procesos del Excel mensual de RDL sin ninguna novedad en el periodo', S.cobradosSinNovedad],
    ['Terminados en el portal que RDL sigue reportando', S.terminadosQueReporta],
    ['Procesos que RDL reporta y no están en el portal', S.enRdlNoPortal],
  ].forEach(f => wr.addRow({ c: f[0], n: f[1] })); wr.getColumn('n').alignment = { horizontal: 'right' };

  const w1 = wb.addWorksheet('No reportadas');
  encabezar(w1, [{ header: 'Radicado', key: 'r', width: 26 }, { header: 'Proceso (portal)', key: 'p', width: 14 }, { header: 'Demandante', key: 'd1', width: 30 }, { header: 'Demandado', key: 'd2', width: 30 }, { header: 'Fecha de la actuación', key: 'f', width: 16 }, { header: 'Actuación en la Rama', key: 'a', width: 44 }, { header: 'RDL debió reportarla el', key: 'l', width: 16 }, { header: 'Carpeta de RDL (Drive)', key: 'dr', width: 40 }]);
  r.noReportadas.forEach(x => w1.addRow({ r: num(x.proceso), p: x.proceso.Radicado || '', d1: x.proceso.Demandante || '', d2: x.proceso.Demandado || '', f: dma(x.fecha), a: x.actuacion, l: dma(x.limite), dr: x.drive }));

  const w2 = wb.addWorksheet('Reportadas tarde');
  encabezar(w2, [{ header: 'Radicado', key: 'r', width: 26 }, { header: 'Proceso (portal)', key: 'p', width: 14 }, { header: 'Fecha de la actuación', key: 'f', width: 16 }, { header: 'Actuación en la Rama', key: 'a', width: 44 }, { header: 'RDL la reportó el', key: 'l', width: 16 }, { header: 'Días hábiles de retraso', key: 'n', width: 14 }]);
  r.tardias.forEach(x => w2.addRow({ r: num(x.proceso), p: x.proceso.Radicado || '', f: dma(x.fecha), a: x.actuacion, l: dma(x.recibido), n: x.retraso })); w2.getColumn('n').alignment = { horizontal: 'right' };

  const w3 = wb.addWorksheet('Sin novedad de RDL');
  encabezar(w3, [{ header: 'Radicado', key: 'r', width: 26 }, { header: 'Proceso (portal)', key: 'p', width: 14 }, { header: 'Demandante', key: 'd1', width: 30 }, { header: 'Demandado', key: 'd2', width: 30 }, { header: 'Actuaciones importantes en la Rama', key: 'n', width: 16 }]);
  r.sinNovedadRDL.forEach(x => w3.addRow({ r: num(x.proceso), p: x.proceso.Radicado || '', d1: x.proceso.Demandante || '', d2: x.proceso.Demandado || '', n: x.importantes })); w3.getColumn('n').alignment = { horizontal: 'right' };

  const w4 = wb.addWorksheet('Cobrados sin novedad');
  encabezar(w4, [{ header: 'Radicado (Excel de RDL)', key: 'r', width: 28 }, { header: 'Consecutivo', key: 'c', width: 14 }, { header: 'Demandante', key: 'd1', width: 30 }, { header: 'Demandado', key: 'd2', width: 30 }, { header: 'Movimiento en la Rama en el periodo', key: 'm', width: 18 }]);
  r.cobradosSinNovedad.forEach(x => w4.addRow({ r: x.radicado, c: x.consecutivo, d1: x.demandante, d2: x.demandado, m: x.movimientoRama == null ? 'no consultado' : x.movimientoRama })); w4.getColumn('m').alignment = { horizontal: 'right' };

  const w5 = wb.addWorksheet('Terminados que reporta');
  encabezar(w5, [{ header: 'Radicado', key: 'r', width: 26 }, { header: 'Proceso (portal)', key: 'p', width: 14 }, { header: 'Despacho', key: 'd', width: 36 }, { header: 'Última novedad que reportó', key: 'u', width: 18 }, { header: 'Carpeta de RDL (Drive)', key: 'dr', width: 40 }]);
  r.terminadosQueReporta.forEach(x => w5.addRow({ r: x.radicado, p: x.proceso.Radicado || '', d: x.despacho, u: dma(x.ultima), dr: x.drive }));

  const w6 = wb.addWorksheet('RDL reporta, no en portal');
  encabezar(w6, [{ header: 'Radicado', key: 'r', width: 26 }, { header: 'Consecutivo', key: 'c', width: 14 }, { header: 'Despacho', key: 'd', width: 36 }, { header: 'Demandante', key: 'd1', width: 30 }, { header: 'Demandado', key: 'd2', width: 30 }, { header: 'Última novedad', key: 'u', width: 16 }, { header: 'Carpeta de RDL (Drive)', key: 'dr', width: 40 }]);
  r.enRdlNoPortal.forEach(x => w6.addRow({ r: x.radicado, c: x.consecutivo, d: x.despacho, d1: x.demandante, d2: x.demandado, u: dma(x.ultima), dr: x.drive }));

  // Diferencias por corregir y seguimiento fuera del portal (de los informes diarios y, si se subió, del Excel mensual)
  {
    const difs = [...(r.diferencias || []), ...((extra && extra.revision && extra.revision.diferencias) || [])];
    const fuera = [...(r.fueraDelPortal || []), ...((extra && extra.revision && extra.revision.fueraDelPortal) || [])];
    const wd = wb.addWorksheet('Mismo proceso, datos distintos');
    encabezar(wd, [{ header: 'Origen', key: 'o', width: 18 }, { header: 'Radicado de RDL', key: 'r', width: 28 }, { header: 'Proceso (portal)', key: 'p', width: 14 }, { header: 'Cliente', key: 'c', width: 30 }, { header: 'Radicado del portal', key: 'n', width: 28 }, { header: 'Diferencia', key: 'd', width: 34 }]);
    difs.forEach(f => wd.addRow({ o: f.origen, r: f.fila.radicado, p: f.proceso.Radicado || '', c: f.proceso.Cliente || '', n: f.proceso.NoCompleto || '', d: f.diferencias.length ? f.diferencias.map(d => d.campo).join(', ') : 'Número corto y partes' }));
    const wf = wb.addWorksheet('Fuera del portal (Daniel)');
    encabezar(wf, [{ header: 'Origen', key: 'o', width: 18 }, { header: 'Radicado', key: 'r', width: 28 }, { header: 'Demandante', key: 'd1', width: 32 }, { header: 'Demandado', key: 'd2', width: 32 }, { header: 'Apoderado', key: 'a', width: 24 }]);
    fuera.forEach(f => wf.addRow({ o: f.origen, r: f.radicado, d1: f.demandante, d2: f.demandado, a: f.apoderado }));
    wr.addRow({ c: '', n: '' });
    wr.addRow({ c: 'Mismo proceso con datos distintos (para corregir)', n: difs.length });
    wr.addRow({ c: 'Seguimiento fuera del portal (no son novedades)', n: fuera.length });
    wr.addRow({ c: 'Procesos ignorados (Supersociedades 76534 y 39696)', n: (r.ignorados || 0) + ((extra && extra.revision && extra.revision.ignorados) || 0) });
  }
  // Si se subió el Excel mensual de RDL: las 3 diferencias contra el portal (lo que antes daba «Revisión de Procesos»), en el mismo archivo
  if(extra && extra.revision){
    const rv = extra.revision;
    const colsRev = [{ header: 'Radicado', key: 'r', width: 28 }, { header: 'Observación', key: 'o', width: 40 }, { header: 'Consecutivo', key: 'c', width: 16 }, { header: 'Portal Lexara', key: 'l', width: 16 }, { header: 'Demandante', key: 'd1', width: 32 }, { header: 'Demandado', key: 'd2', width: 32 }, { header: 'Apoderado', key: 'a', width: 30 }];
    [['Excel · no están en el portal', rv.noEncontrados], ['Excel · terminados que cobra', rv.terminados], ['Excel · vigentes sin incluir', rv.faltantesEnArchivo]].forEach(([nombre, filas]) => {
      const w = wb.addWorksheet(nombre); encabezar(w, colsRev);
      filas.forEach(f => w.addRow({ r: f.radicado, o: f.observacion, c: f.consecutivo, l: f.lexara, d1: f.demandante, d2: f.demandado, a: f.apoderado }));
    });
    wr.addRow({ c: '', n: '' });
    wr.addRow({ c: 'Excel mensual de RDL: procesos que no están en el portal', n: rv.noEncontrados.length });
    wr.addRow({ c: 'Excel mensual de RDL: terminados en el portal que cobra', n: rv.terminados.length });
    wr.addRow({ c: 'Excel mensual de RDL: vigentes del portal que no incluyó', n: rv.faltantesEnArchivo.length });
  }

  const buffer = await wb.xlsx.writeBuffer();
  // Para adjuntarlo a un correo (en vez de descargarlo): { nombre, contentType, base64 }
  if(opciones && opciones.devolver){
    const bytes = new Uint8Array(buffer);
    let bin = ''; for(let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return { nombre: `${nombreArchivo}.xlsx`, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', base64: btoa(bin) };
  }
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${nombreArchivo}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
