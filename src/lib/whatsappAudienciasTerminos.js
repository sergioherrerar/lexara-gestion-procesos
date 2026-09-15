// "Compartir por WhatsApp" de Audiencias/Términos — pedido explícito del
// usuario 2026-09-15: primero se pensó en un envío automático (Telegram,
// luego Teams) todos los lunes hábiles, pero al final se prefirió algo mucho
// más simple y sin infraestructura nueva — un botón que arma el mensaje con
// lo que vence en los próximos 5 días hábiles (contados siempre desde el
// momento en que se oprime el botón, no un mes calendario fijo) y abre
// WhatsApp con el texto ya redactado, igual que el botón de Tutelas (ver
// informeTutelas.js/construirMensajeWhatsAppTutelas): wa.me no tiene
// destinatario fijo, así que quien hace clic elige a quién o a qué grupo
// mandarlo desde su propia lista de chats.
import { diasHabilesRestantes, sumarDiasHabilesJudiciales } from './audienciasTerminos';

const DIAS = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

function soloFechaISO(v){ return String(v || "").slice(0, 10); }

function hoyISO(d = new Date()){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function fechaHoraLarga(d){
  let horas12 = d.getHours() % 12; if(horas12 === 0) horas12 = 12;
  const ampm = d.getHours() >= 12 ? 'p. m.' : 'a. m.';
  const mins = String(d.getMinutes()).padStart(2,'0');
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}    ${horas12}:${mins} ${ampm}`;
}

function fechaCorta(iso){
  const [y,m,d] = String(iso).slice(0,10).split('-');
  return `${d}/${m}/${y}`;
}

// Junta Audiencias o Términos con su Proceso (Radicado/Cliente) y su fecha
// objetivo, filtrando solo lo que vence entre hoy y `fechaLimite` (ambos
// incluidos) — nunca lo ya vencido.
function itemsEnVentana(registros, tipoRegistro, procesos, fechaDesde, fechaLimite){
  return (registros||[])
    .map(r => {
      // String(...) (mismo bug real ya corregido en AudienciasTerminosTab.jsx):
      // en vivo r.Proceso puede llegar como número y p.id siempre es texto.
      const proceso = (procesos||[]).find(p => String(p.id) === String(r.Proceso)) || null;
      const fechaObjetivo = tipoRegistro === 'audiencias'
        ? soloFechaISO(r.FechaAudiencia)
        : (soloFechaISO(r.VencimientoTermino) || sumarDiasHabilesJudiciales(soloFechaISO(r.FechaNotificacion), r.DiasHabiles));
      return { ...r, proceso, fechaObjetivo };
    })
    .filter(r => r.fechaObjetivo && r.fechaObjetivo >= fechaDesde && r.fechaObjetivo <= fechaLimite)
    .sort((a,b) => a.fechaObjetivo.localeCompare(b.fechaObjetivo));
}

function listadoTexto(items){
  if(!items.length) return '(sin registros)';
  return items.map((r,i) => {
    const radicado = r.proceso?.Radicado || "—";
    const cliente = r.proceso?.Cliente ? ` — ${r.proceso.Cliente}` : '';
    const descripcion = r.Descripcion ? ` — ${r.Descripcion}` : '';
    return `${i+1}. ${radicado}${cliente}${descripcion} — vence ${fechaCorta(r.fechaObjetivo)}`;
  }).join('\n');
}

// Mensaje de texto plano para "Compartir por WhatsApp" — siempre los
// próximos 5 días hábiles judiciales contados desde `fechaRef` (por
// defecto, el momento en que se oprime el botón).
export function construirMensajeWhatsAppAudienciasTerminos(audiencias, terminos, procesos, fechaRef = new Date()){
  const fechaDesde = hoyISO(fechaRef);
  const fechaLimite = sumarDiasHabilesJudiciales(fechaDesde, 5);
  const terminosVentana = itemsEnVentana(terminos, 'terminos', procesos, fechaDesde, fechaLimite);
  const audienciasVentana = itemsEnVentana(audiencias, 'audiencias', procesos, fechaDesde, fechaLimite);
  return `*Audiencias y Términos — próximos 5 días hábiles*\n${fechaHoraLarga(fechaRef)}\n(${fechaCorta(fechaDesde)} a ${fechaCorta(fechaLimite)})\n\n`
    + `*Términos (${terminosVentana.length})*\n${listadoTexto(terminosVentana)}\n\n`
    + `*Audiencias (${audienciasVentana.length})*\n${listadoTexto(audienciasVentana)}`;
}
