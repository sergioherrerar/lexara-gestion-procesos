import { useState } from 'react';
import { mensajeError, fmtDate, listarDocumentosCorporativos, subirDocumentoCorporativo, descargarContenidoArchivo } from '../lib/graph';
import { generarZipDocumentosCorporativos, extraerTextoPDF, extraerDatosCamaraComercio } from '../lib/documentosCorporativos';
import { DOCUMENTOS_CORPORATIVOS_RUTA, DOCUMENTOS_CORPORATIVOS_TIPOS, FICHA_EMPRESA_MD } from '../config';
import { IconTextButton } from './IconButton';

// "Diligenciamiento Formatos Empresas" (Informes > Herramientas) — agregada
// 2026-09-11, pedido explícito del usuario ("Opción 1 + A", con selección
// manual de cuáles documentos entran al ZIP): cuando un banco/cliente/EPS
// pide que MD Abogados llene su propio "formato de vinculación de
// proveedores", casi siempre hay que mandar los mismos datos + documentos
// de soporte — acá se copian los datos con un clic y se arma un ZIP con los
// documentos que el usuario elija. También se puede subir/reemplazar cada
// documento directo desde acá (pedido explícito del usuario 2026-09-11:
// "sería más fácil subir al portal el documento y que se actualice solo")
// en vez de tener que ir a SharePoint a mano cuando un documento vence. No
// intenta llenar el formato de la empresa externa (eso quedó para una
// siguiente fase, "aprender" el formato de Excel) — solo junta lo que ya
// casi siempre hay que adjuntar.
const CAMPOS_FICHA = [
  { key: 'razonSocial', label: 'Razón Social' },
  { key: 'nit', label: 'NIT' },
  { key: 'representanteLegal', label: 'Representante Legal' },
  { key: 'ccRepresentante', label: 'C.C. Representante' },
  { key: 'tarjetaProfesional', label: 'Tarjeta Profesional' },
  { key: 'direccion', label: 'Dirección' },
  { key: 'ciudad', label: 'Ciudad' },
  { key: 'telefono', label: 'Teléfono' },
  { key: 'correo', label: 'Correo' },
  { key: 'actividadEconomica', label: 'Actividad económica' },
  { key: 'valorActivos', label: 'Valor Activos (2025)' },
  { key: 'valorPasivos', label: 'Valor Pasivos (2025)' },
  { key: 'valorPatrimonio', label: 'Valor Patrimonio (2025)' },
];

// Campos que se leen automático del certificado de Cámara de Comercio (ver
// extraerDatosCamaraComercio en lib/documentosCorporativos.js) cuando ese
// documento está disponible — para los demás, se usa el valor fijo de
// config.js.
const CAMPOS_LEIDOS_DE_CAMARA = ['direccion', 'telefono', 'correo', 'actividadEconomica'];

function FichaDatos({ notify, datosCamara, leyendoCamara }){
  async function copiar(valor, label){
    if(!valor){ notify?.(`${label} todavía no está configurado — avísale a soporte.`, 'error'); return; }
    try{
      await navigator.clipboard.writeText(valor);
      notify?.(`${label} copiado al portapapeles.`, 'success');
    }catch(err){
      console.error(err);
      notify?.('No se pudo copiar automáticamente — selecciona el texto y cópialo a mano.', 'error');
    }
  }
  return (
    <div className="panel" style={{marginBottom:18}}>
      <div className="panel-head"><h3>Ficha de datos MD Abogados</h3></div>
      <div className="panel-body">
        <p className="save-hint" style={{marginBottom:12}}>
          Clic en cualquier dato para copiarlo. Dirección/Teléfono/Correo/Actividad económica se leen automático del certificado de Cámara de Comercio{leyendoCamara ? " (leyendo…)" : ""}.
        </p>
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px,1fr))', gap:10}}>
          {CAMPOS_FICHA.map(c => {
            const leidoDeCamara = CAMPOS_LEIDOS_DE_CAMARA.includes(c.key);
            const valor = (leidoDeCamara && datosCamara?.[c.key]) || FICHA_EMPRESA_MD[c.key];
            return (
              <div
                key={c.key}
                className="field-card"
                style={{cursor:'pointer'}}
                title="Clic para copiar"
                onClick={() => copiar(valor, c.label)}
              >
                <div className="field-card-label">
                  {c.label}{leidoDeCamara && datosCamara?.[c.key] ? " (Cámara de Comercio)" : ""}
                </div>
                <div className="field-card-value" style={!valor ? {color:'var(--texto-suave)', fontStyle:'italic'} : undefined}>
                  {valor || "— sin configurar —"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function DiligenciamientoFormatosTab({ config, notify, liveMode }){
  const [documentos, setDocumentos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [seleccionados, setSeleccionados] = useState(new Set());
  const [generandoZip, setGenerandoZip] = useState(false);
  const [subiendoKey, setSubiendoKey] = useState(null);
  const [datosCamara, setDatosCamara] = useState(null);
  const [leyendoCamara, setLeyendoCamara] = useState(false);

  const carpetaConfigurada = !!DOCUMENTOS_CORPORATIVOS_RUTA;

  // Lee el certificado de Cámara de Comercio en cuanto aparece en la lista
  // (Dirección/Teléfono/Correo/Actividad económica) — si por lo que sea no
  // se puede leer (PDF cambió de formato, quedó escaneado, etc.), se queda
  // con los valores fijos de config.js sin tumbar el resto de la pantalla.
  async function leerCamaraComercio(docCamara){
    if(!docCamara?.archivo) return;
    setLeyendoCamara(true);
    try{
      const buffer = await descargarContenidoArchivo(docCamara.archivo);
      const texto = await extraerTextoPDF(buffer);
      setDatosCamara(extraerDatosCamaraComercio(texto));
    }catch(err){
      console.error(err);
      notify?.("No se pudo leer el certificado de Cámara de Comercio automáticamente — se usan los datos guardados.", 'error');
    } finally { setLeyendoCamara(false); }
  }

  async function handleCargar(){
    setCargando(true);
    try{
      const res = await listarDocumentosCorporativos(config, DOCUMENTOS_CORPORATIVOS_RUTA, DOCUMENTOS_CORPORATIVOS_TIPOS);
      setDocumentos(res);
      setSeleccionados(new Set(res.filter(d => d.archivo).map(d => d.key)));
      leerCamaraComercio(res.find(d => d.key === 'camaraComercio'));
    }catch(err){
      console.error(err);
      notify?.("No se pudo cargar la carpeta de documentos: " + mensajeError(err), 'error');
    } finally { setCargando(false); }
  }

  function toggle(key){
    setSeleccionados(prev => {
      const next = new Set(prev);
      if(next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function handleDescargarZip(){
    const elegidos = (documentos||[]).filter(d => seleccionados.has(d.key) && d.archivo);
    if(!elegidos.length){ notify?.("Selecciona al menos un documento.", 'error'); return; }
    setGenerandoZip(true);
    try{
      await generarZipDocumentosCorporativos(elegidos, `Documentos MD Abogados ${new Date().toISOString().slice(0,10)}`);
    }catch(err){
      console.error(err);
      notify?.("No se pudo generar el ZIP: " + mensajeError(err), 'error');
    } finally { setGenerandoZip(false); }
  }

  // Sube/reemplaza el documento de un tipo — si ya había un archivo
  // encontrado se sube con EL MISMO nombre (reemplazo limpio, sin
  // duplicar); si no existía ninguno, se arma un nombre nuevo con la
  // etiqueta del tipo + la extensión real del archivo elegido.
  async function handleSubir(doc, file){
    if(!file) return;
    const extension = (file.name.match(/\.[^.]+$/)||[''])[0];
    const nombreArchivo = doc.archivo ? doc.archivo.name : `${doc.label}${extension}`;
    setSubiendoKey(doc.key);
    try{
      await subirDocumentoCorporativo(config, DOCUMENTOS_CORPORATIVOS_RUTA, nombreArchivo, file);
      notify?.(`"${nombreArchivo}" se subió con éxito.`, 'success');
      await handleCargar();
    }catch(err){
      console.error(err);
      notify?.(`No se pudo subir "${nombreArchivo}": ` + mensajeError(err), 'error');
    } finally { setSubiendoKey(null); }
  }

  return (
    <div>
      <p style={{margin:'0 0 16px', color:'var(--texto-suave)', fontSize:13}}>
        Cuando un banco, cliente o EPS pida llenar su propio formato de vinculación de proveedores: copia los datos de la ficha de abajo y elige cuáles documentos de soporte armar en un ZIP para adjuntar. Cuando un documento venza, súbelo de nuevo desde acá mismo (columna "Subir/Reemplazar") — no hace falta ir a SharePoint.
      </p>

      <FichaDatos notify={notify} datosCamara={datosCamara} leyendoCamara={leyendoCamara} />

      <div className="panel">
        <div className="panel-head"><h3>Documentos corporativos</h3></div>
        <div className="panel-body">
          {!carpetaConfigurada ? (
            <p className="save-hint" style={{color:'var(--rojo, #b23b3b)'}}>
              Todavía falta configurar la ruta de la carpeta de documentos corporativos — avísale a soporte.
            </p>
          ) : !liveMode ? (
            <p className="save-hint">Esta herramienta necesita una sesión en vivo conectada a SharePoint (no funciona en modo demo).</p>
          ) : !documentos ? (
            <IconTextButton icon="refresh" variant="secondary" onClick={handleCargar} disabled={cargando}>
              {cargando ? "Cargando…" : "Cargar documentos"}
            </IconTextButton>
          ) : (
            <>
              <div className="table-wrap" style={{marginBottom:16}}>
                <table className="table-compact">
                  <thead>
                    <tr><th></th><th>Documento</th><th>Archivo encontrado</th><th>Última modificación</th><th>Abrir</th><th>Subir/Reemplazar</th></tr>
                  </thead>
                  <tbody>
                    {documentos.map(d => (
                      <tr key={d.key}>
                        <td><input type="checkbox" checked={seleccionados.has(d.key)} disabled={!d.archivo} onChange={() => toggle(d.key)} /></td>
                        <td className="cliente">{d.label}</td>
                        <td>{d.archivo ? d.archivo.name : <span className="badge badge-alerta">No encontrado</span>}</td>
                        <td>{d.archivo ? fmtDate(d.archivo.lastModifiedDateTime) : "—"}</td>
                        <td>{d.archivo && <a href={d.archivo.webUrl} target="_blank" rel="noopener noreferrer">Abrir</a>}</td>
                        <td>
                          <label className="btn-secondary" style={{cursor: subiendoKey===d.key ? 'default' : 'pointer', display:'inline-block', fontSize:12, padding:'5px 10px'}}>
                            {subiendoKey===d.key ? "Subiendo…" : (d.archivo ? "Reemplazar" : "Subir")}
                            <input
                              type="file"
                              accept={d.esImagen ? "image/png,image/jpeg" : ".pdf,.doc,.docx,.xls,.xlsx,image/png,image/jpeg"}
                              disabled={subiendoKey===d.key}
                              style={{display:'none'}}
                              onChange={e => { const file = e.target.files?.[0]; handleSubir(d, file); e.target.value=""; }}
                            />
                          </label>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{display:'flex', gap:10, flexWrap:'wrap'}}>
                <IconTextButton icon="zip" variant="primary" onClick={handleDescargarZip} disabled={generandoZip}>
                  {generandoZip ? "Generando…" : "Descargar ZIP con seleccionados"}
                </IconTextButton>
                <button type="button" className="btn-secondary" onClick={handleCargar} disabled={cargando}>Actualizar lista</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
