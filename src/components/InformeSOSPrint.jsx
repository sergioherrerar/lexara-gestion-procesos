import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import logoVerde from '../assets/Logo verde OScuro.png';
import qrRedes from '../assets/Qr_Redes.png';
import { stripHtml, fmtMonto, parseMonto } from '../lib/graph';

// Nombre legal completo de cada Entidad para el encabezado de la carta — el
// campo "Entidad" del proceso solo guarda una etiqueta corta ("SOS"), no la
// razón social completa a la que se le dirige el informe. Si se agrega el
// informe formal de otra Entidad, sumar su nombre completo aquí.
const NOMBRE_COMPLETO_ENTIDAD = {
  SOS: "EPS SERVICIO OCCIDENTAL DE SALUD S.A",
};

const DIAS = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
function fechaLarga(d){
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}
function fechaCorta(iso){
  if(!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if(!m) return "—";
  return `${m[3]}/${m[2]}/${m[1]}`;
}
function preloadImage(src){
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

// Carta formal de reporte de procesos, por Entidad — hoy solo tiene el
// formato de "SOS" armado (ver [[project_informes_modulo]]). A diferencia de
// Factura/Orden de compra (una sola hoja), esta carta puede ocupar varias
// páginas según cuántos procesos tenga la Entidad, así que se renderiza vía
// portal directo a <body> (fuera de ".main", que el CSS de impresión oculta
// por completo) y usa encabezado/pie en position:fixed para que se repitan
// en cada página al imprimir (ver reglas ".print-informe*" en styles.css).
export default function InformeSOSPrint({ entidad, procesos, onDone }){
  useEffect(() => {
    if(!procesos) return;
    Promise.all([preloadImage(logoVerde), preloadImage(qrRedes)]).then(() => {
      window.print();
      onDone && onDone();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [procesos]);

  if(!procesos) return null;

  const hoy = new Date();
  const fecha = fechaLarga(hoy);
  const nombreEntidad = NOMBRE_COMPLETO_ENTIDAD[entidad?.toUpperCase()] || entidad;
  const filas = [...procesos].sort((a,b) => (a.NoCompleto||a.Radicado||"").localeCompare(b.NoCompleto||b.Radicado||""));

  return createPortal(
    <div className="print-informe">
      <div className="print-informe-header">
        <img src={logoVerde} alt="Lexara Abogados" />
        <div className="print-informe-titulo">
          <h1>Reporte procesos judiciales</h1>
          <h2>MD ABOGADOS SAS · Nit 900.495.788-3</h2>
        </div>
      </div>

      <div className="print-informe-carta">
        <p>Bogotá D.C., {fecha}</p>
        <p>Señores:<br/><strong>{nombreEntidad}</strong><br/>Ciudad</p>
        <p className="print-informe-asunto">Asunto: Reporte procesos judiciales</p>
        <div className="print-informe-resumen">Cantidad de procesos: {filas.length}</div>
        <p>Cordial saludo,</p>
        <p>
          De manera cordial me permito informar que, con corte al {fecha}, a cargo de MD ABOGADOS SAS se
          encuentran un total de {filas.length} procesos judiciales, con pretensiones de recobros ante la
          ADRES, de los cuales en el siguiente cuadro se especifica su radicado actual, estado del proceso,
          cuantía, y última novedad, cuyo detalle se encuentra en el informe de Excel adjunto.
        </p>
      </div>

      <table className="print-informe-tabla">
        <thead>
          <tr><th>No. Radicado</th><th>Fecha Estado</th><th>Estado</th><th>Valor Actual Demanda</th></tr>
        </thead>
        <tbody>
          {filas.map(p => (
            <tr key={p.id}>
              <td className="col-radicado">{p.NoCompleto || p.Radicado || "—"}</td>
              <td className="col-fecha">{fechaCorta(p.FechaUltimoEstado)}</td>
              <td>{stripHtml(p.Estado) || "—"}</td>
              <td className="col-valor">{p.ValorActualDemanda ? fmtMonto(parseMonto(p.ValorActualDemanda)) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="print-informe-firma">
        <p>Certifico cordialmente,</p>
        <p className="nombre">MÓNICA PAOLA QUINTERO JIMÉNEZ</p>
        <p>C.C. No. 40.039.240 de Tunja</p>
        <p>T.P. No. 97.956 del C. S. de la J.</p>
      </div>

      <div className="print-informe-footer">
        <div className="print-page-footer-contact">
          <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"/></svg> www.lexaraabogados.com</span>
          <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/></svg> Gerencia@lexaraabogados.com</span>
          <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .7 3a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.2-1.3a2 2 0 0 1 2.1-.5c1 .4 2 .6 3 .7a2 2 0 0 1 1.7 2z"/></svg> +57 312 442 0026</span>
        </div>
        <div className="print-page-footer-meta">
          <img src={qrRedes} alt="Redes sociales" className="print-qr" style={{width:'22mm', height:'22mm'}} />
        </div>
      </div>
    </div>,
    document.body
  );
}
