import miniVerdeOscuro from '../assets/Mini verde oscuro.png';

// Pedido explícito del usuario 2026-09-11: la animación de carga (el logo
// que ya giraba chiquito en la Topbar) se ve también grande y traslúcido en
// el centro de la pantalla mientras se conecta y trae los datos de
// SharePoint por primera vez — como una "marca de agua" de fondo, no un
// modal que bloquee nada.
export default function CargaInicialOverlay(){
  return (
    <div className="carga-inicial-overlay">
      <img src={miniVerdeOscuro} alt="" className="carga-inicial-logo" />
      <span className="carga-inicial-texto">Cargando datos de SharePoint…</span>
    </div>
  );
}
