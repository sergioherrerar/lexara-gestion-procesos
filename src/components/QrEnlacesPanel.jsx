import { useEffect, useState } from 'react';
import { generarQRDataUrl, LINK_REDES_SOCIALES } from '../lib/qr';
import { IconTextButton } from './IconButton';

// Panel del Dashboard (2026-10-05, pedido explícito del usuario: "dame un QR
// para descargar, puedes colocarlo también en el dashboard") — muestra el mismo
// QR de la página de enlaces de Lexara que va en las facturas, las órdenes de
// compra y la certificación laboral (con el logo en el centro) y deja
// descargarlo en alta resolución para imprimirlo o usarlo en redes.
// Ver LINK_REDES_SOCIALES en lib/qr.js.
export default function QrEnlacesPanel({ notify }){
  const [vista, setVista] = useState('');
  const [descargando, setDescargando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    generarQRDataUrl(LINK_REDES_SOCIALES, { width: 320 })
      .then(url => { if(!cancelado) setVista(url); })
      .catch(err => console.error('No se pudo generar la vista previa del QR:', err));
    return () => { cancelado = true; };
  }, []);

  async function handleDescargar(){
    setDescargando(true);
    try{
      // 1200 px: nítido para imprimir (≈10 cm a 300 dpi) sin pesar casi nada.
      const url = await generarQRDataUrl(LINK_REDES_SOCIALES, { width: 1200 });
      const a = document.createElement('a');
      a.href = url;
      a.download = 'QR Lexara Abogados.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }catch(err){
      console.error(err);
      notify?.('No se pudo generar el QR: ' + (err.message || 'error'), 'error');
    }finally{
      setDescargando(false);
    }
  }

  async function handleCopiar(){
    try{
      await navigator.clipboard.writeText(LINK_REDES_SOCIALES);
      notify?.('Enlace copiado.', 'success');
    }catch{
      notify?.('No se pudo copiar automáticamente. El enlace es: ' + LINK_REDES_SOCIALES, 'info');
    }
  }

  return (
    <div className="panel" style={{marginTop:20}}>
      <div className="panel-head"><h3>Código QR de enlaces de Lexara</h3></div>
      <div className="panel-body" style={{padding:'20px', display:'flex', gap:24, flexWrap:'wrap', alignItems:'center'}}>
        <div style={{width:160, height:160, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:'#fff', border:'1px solid var(--gris-linea)', borderRadius:10}}>
          {vista
            ? <img src={vista} alt="Código QR de la página de enlaces de Lexara" style={{width:148, height:148}} />
            : <span className="save-hint">Generando…</span>}
        </div>
        <div style={{flex:'1 1 240px', minWidth:0}}>
          <p style={{margin:'0 0 6px', fontWeight:600}}>Contacto, servicios y redes sociales</p>
          <p className="save-hint" style={{margin:'0 0 14px', overflowWrap:'anywhere'}}>
            Al escanearlo abre <a href={LINK_REDES_SOCIALES} target="_blank" rel="noopener noreferrer">{LINK_REDES_SOCIALES}</a>. Es el mismo QR "Síguenos" de las facturas, órdenes de compra y certificaciones.
          </p>
          <div style={{display:'flex', gap:10, flexWrap:'wrap'}}>
            <IconTextButton icon="zip" variant="primary" disabled={descargando} onClick={handleDescargar}>
              {descargando ? 'Generando…' : 'Descargar QR (PNG)'}
            </IconTextButton>
            <IconTextButton icon="open" variant="secondary" onClick={handleCopiar}>Copiar enlace</IconTextButton>
          </div>
        </div>
      </div>
    </div>
  );
}
