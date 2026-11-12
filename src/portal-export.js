// Exportación del PORTAL DE CLIENTES (2026-11-11): reúne los informes REALES de la app (mismos Excel y PDF con membrete y firma) para que el portal los genere en el navegador del cliente.
// Se empaqueta aparte (vite.config.portal.js → portal-clientes/exportar.js) y expone window.PortalExport. Los formatos son los de «Informes»: Grupo Colmédica, Aliansalud, Famisanar, SOS
// y el genérico de Lexara para las demás entidades; la ficha del proceso; y las tutelas («Tutelas por Cliente» en Excel y carta en PDF).
import { generarInformeGrupoExcel, generarInformeGrupoPDF } from './lib/informeGrupo';
import { generarInformeLexaraExcel, generarInformeLexaraPDF } from './lib/informeLexara';
import { generarInformeFamisanarExcel, generarInformeFamisanarPDF } from './lib/informeFamisanar';
import { generarInformeSOSExcel, generarInformeSOSPDF } from './lib/informeSOS';
import { generarInformeAliansaludPDF } from './lib/informeAliansalud';
import { generarFichaProcesoPDF } from './lib/informeProceso';
import { descargarExcelClientesTutelas } from './lib/informeClientesTutelas';
import { generarCartaInformePDF, fechaLarga, fechaCorta, VERDE_OSCURO, GRIS_SUAVE } from './lib/informesPDF';
import { normalize } from './portal-graph-stub';

// Mismo reparto de formatos que FORMATOS_POR_ENTIDAD de la app (InformesView.jsx).
const FORMATOS = {
  'grupo colmedica': { excel: generarInformeGrupoExcel, pdf: generarInformeGrupoPDF },
  aliansalud: { excel: generarInformeGrupoExcel, pdf: generarInformeAliansaludPDF },
  famisanar: { excel: generarInformeFamisanarExcel, pdf: generarInformeFamisanarPDF },
  sos: { excel: generarInformeSOSExcel, pdf: generarInformeSOSPDF },
  colpatria: { excel: generarInformeLexaraExcel, pdf: generarInformeGrupoPDF },
};
const GENERICO = { excel: generarInformeLexaraExcel, pdf: generarInformeLexaraPDF };
const activo = p => !String(p.EstadoVT || '').toLowerCase().includes('termin');   // igual que esProcesoActivo de la app

function formatoDe(clave){ return FORMATOS[normalize(clave).replace(/\s+/g, ' ').trim()] || GENERICO; }

window.PortalExport = {
  /** Informe de procesos. tipo: 'excel' | 'pdf'. entidad: la Entidad del cliente (elige el formato); nombre: cómo se llama el archivo / la carta. */
  procesos: async function(tipo, entidad, nombre, procesos){
    const fmt = formatoDe(entidad);
    // Como en Informes: el reporte de varios procesos solo lleva los vigentes; la ficha o el Excel de UN proceso sí sirve aunque esté terminado.
    const lista = procesos.length > 1 ? procesos.filter(activo) : procesos;
    if(tipo === 'excel') return fmt.excel(nombre, lista, [], []);
    return fmt.pdf(nombre, lista);
  },
  /** Ficha de UN proceso en PDF (sin valores ni contingencia). */
  ficha: function(proceso){ return generarFichaProcesoPDF(proceso, { paraCliente: true }); },
  /** Tutelas en Excel: el mismo «Tutelas por Cliente» (hoja de tutelas + hoja por cliente con Valor Entidad). */
  tutelasExcel: function(tutelas, valoresEntidad, nombreArchivo){ return descargarExcelClientesTutelas(tutelas, valoresEntidad, nombreArchivo); },
  /** Tutelas en PDF: la carta de Lexara (membrete, firma y tabla) con las tutelas de la lista. */
  tutelasPDF: async function(tutelas, nombreEntidad, rango){
    const filas = tutelas.slice().sort((a, b) => String(a.FechaVencimiento || '').localeCompare(String(b.FechaVencimiento || '')));
    const parrafo = 'De manera cordial me permito informar que, con corte al ' + fechaLarga(new Date()) + ', se relacionan ' + filas.length + ' tutela' + (filas.length === 1 ? '' : 's') +
      ' a cargo de MD ABOGADOS SAS' + (rango ? ', ' + rango : '') + '. En el siguiente cuadro se especifica su número, cliente, juzgado, fechas de notificación y vencimiento, tipo de respuesta y estado de la contestación; el detalle completo se encuentra en el informe de Excel.';
    return generarCartaInformePDF({
      nombreArchivo: 'Informe tutelas ' + nombreEntidad,
      tituloEncabezado: 'Reporte de tutelas',
      nombreEntidad,
      cantidadProcesos: filas.length,
      asunto: 'Reporte de tutelas',
      etiquetaCantidad: 'Cantidad de tutelas',
      unidad: 'tutela',
      parrafo,
      columnas: ['No. tutela', 'Cliente', 'Juzgado', 'Notificación / Vencimiento', 'Tipo', 'Contestación'],
      filas: filas.map(t => [
        t.NoTutela || '—', t.Cliente || '—', t.Juzgado || '—', fechaCorta(t.FechaNotificacion) + '\n' + fechaCorta(t.FechaVencimiento), t.TipoRespuesta || '—',
        t.Contestada ? 'Enviada ' + fechaCorta(t.FechaContestacion) : 'Por enviar',
      ]),
      columnStyles: {
        0: { halign: 'center', fontStyle: 'bold', textColor: VERDE_OSCURO, cellWidth: 22 },
        1: { halign: 'left', cellWidth: 36 },
        2: { halign: 'left', cellWidth: 'auto' },
        3: { halign: 'center', cellWidth: 30, textColor: GRIS_SUAVE },
        4: { halign: 'center', cellWidth: 28, fontSize: 7.5 },
        5: { halign: 'center', cellWidth: 25 },
      },
    });
  },
};
