// «Etapas por cobrar» (2026-11-27, pedido del usuario): en Formas de pago cada contrato tiene hasta 6 etapas (Pago 1…6: etapa y valor en salarios) y, cuando se factura una etapa, el portal pone el número de la factura.
// Aquí se hace lo que falta ANTES de facturar: detectar qué etapas YA PASARON en el proceso y todavía no tienen factura ni orden de compra, para saber qué cobrar. Se revisan TODOS los procesos que tienen etapas sin cobrar.
// Detecta con las actuaciones de la Rama y el Histórico del proceso; la «Entrega de poder» (la envía el cliente) se detecta por el correo del poder. Es una PISTA con su evidencia (fecha y actuación): nunca marca
// «cumplida» ni factura sola; la decisión de cobrar es de una persona. Funciones puras, sin red.
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9% ]+/g, ' ').replace(/\s+/g, ' ').trim();
const iso = v => String(v || '').slice(0, 10);

// Cómo se reconoce que pasó cada etapa (nombres de ETAPA_CONTRATO_OPTIONS, normalizados). 'poder' se detecta por correo; sin regla = manual.
const REGLAS = [
  { etapas: ['entrega de poder', 'entrega poder demanda'], tipo: 'poder', nombre: 'El cliente envió el poder' },
  { etapas: ['radicacion demanda'], re: /acta de reparto|reparto|radicacion de la demanda|demanda radicada|radica demanda/, nombre: 'Radicación de la demanda' },
  { etapas: ['admision'], re: /admite (la )?demanda|admision de la demanda|auto admite|admitir la demanda|admitase la demanda/, nombre: 'Auto que admite la demanda' },
  { etapas: ['reforma'], re: /reforma (de )?(la )?demanda/, nombre: 'Reforma de la demanda' },
  { etapas: ['contestacion', 'radicacion de contestacion'], re: /contestacion (de )?(la )?demanda|contesta(r)? (la )?demanda|por contestada|tiene por contestada|traslado (de )?(las )?excepciones/, nombre: 'Contestación de la demanda' },
  { etapas: ['pronunciamiento frente a las exepciones', 'pronunciamiento frente a las excepciones'], re: /pronunciamiento.*excepciones|descorre.*excepciones|traslado (de )?(las )?excepciones/, nombre: 'Traslado o pronunciamiento sobre excepciones' },
  { etapas: ['escrito de oposicion'], re: /oposicion/, nombre: 'Escrito de oposición' },
  { etapas: ['audiencia de conciliacion', 'acta audiencia'], re: /acta (de )?audiencia|acta audiencia|registro de audiencia|audiencia (inicial|de conciliacion|de tramite|de pruebas|de juzgamiento) (realizada|celebrada|llevada)|se (realizo|llevo a cabo) (la )?audiencia/, nombre: 'Audiencia realizada (acta)' },
  { etapas: ['auto de pruebas'], re: /decreta(n)? (las )?pruebas|auto (de )?pruebas|decreto de pruebas|abre a pruebas|auto que decreta/, nombre: 'Auto que decreta pruebas' },
  { etapas: ['sentencia 2da'], re: /segunda instancia|sentencia.*(2da|2a instancia)|apelacion de (la )?sentencia.*(confirma|revoca|modifica)|(confirma|revoca|modifica) (la )?sentencia/, nombre: 'Sentencia de segunda instancia' },
  { etapas: ['sentencia 1ra'], re: /sentencia|fallo de primera|fallo/, excluir: /segunda instancia|2da|2a instancia|proyecto de sentencia|fija fecha.*sentencia|audiencia de (juzgamiento|sentencia)/, nombre: 'Sentencia de primera instancia' },
];
export function reglaDeEtapa(etapa){
  const e = norm(etapa);
  return REGLAS.find(r => r.etapas.includes(e)) || null;
}

/** Busca la evidencia en las actuaciones de la Rama: la más antigua que cumpla la regla → { fecha, texto, origen: 'Rama' } o null. */
export function detectarEnActuaciones(regla, actuaciones){
  if(!regla || !regla.re) return null;
  const hallazgos = (actuaciones || []).filter(a => {
    const t = norm((a.actuacion || '') + ' ' + (a.anotacion || ''));
    const titulo = norm(a.actuacion || '');
    return (regla.re.test(titulo) || regla.re.test(t)) && !(regla.excluir && regla.excluir.test(titulo));
  }).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  const h = hallazgos[0];
  return h ? { fecha: iso(h.fecha), texto: String(h.actuacion || '').trim(), origen: 'Rama' } : null;
}
/** Igual, en el texto del Histórico del proceso (sin etiquetas): { texto: fragmento, origen: 'Histórico' } o null. */
export function detectarEnHistorico(regla, textoPlano){
  if(!regla || !regla.re) return null;
  const t = String(textoPlano || '');
  const n = norm(t);
  const m = regla.re.exec(n);
  if(!m || (regla.excluir && regla.excluir.test(n.slice(Math.max(0, m.index - 40), m.index + 80)))) return null;
  return { fecha: '', texto: n.slice(Math.max(0, m.index - 30), m.index + 90).trim(), origen: 'Histórico' };
}
/** El poder lo envía el cliente por correo: de los correos ya leídos, el primero cuyo asunto o texto habla del poder y apunta al proceso. { fecha, texto, origen: 'Correo' } o null. */
export function detectarPoderEnCorreos(correos, proceso, procesosDeCorreo){
  const hallados = (correos || []).filter(c => /\bpoder(es)?\b/.test(norm(c.asunto + ' ' + (c.resumen || ''))) && !/@lexaraabogados\.com$/i.test(String(c.remitente || ''))
    && procesosDeCorreo(c.asunto + ' ' + (c.resumen || ''), [proceso]).length > 0).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  const c = hallados[0];
  return c ? { fecha: iso(c.fecha), texto: String(c.asunto || '').trim(), origen: 'Correo' } : null;
}

// Contratos que se cobran MENSUALMENTE (2026-11-28, aclaración del usuario): todos los procesos de ese contrato tienen sus etapas incluidas en la mensualidad, así que NINGUNA etapa se cobra por separado y no salen en «Etapas por cobrar».
// GJU-31-03-2025-431 = SOS (la factura mensual de $7.000.000). Para agregar otro contrato mensual basta con sumarlo aquí.
export const CONTRATOS_MENSUALES = ['GJU-31-03-2025-431'];
export const esContratoMensual = contrato => CONTRATOS_MENSUALES.some(c => norm(c) === norm(contrato));
const mismoContrato = (a, b) => !!norm(a) && norm(a) === norm(b);
/** Las etapas de las formas de pago que todavía NO se han cobrado: sin número de factura guardado y sin factura ni orden de compra con el mismo contrato y etapa. */
export function etapasSinCobrar({ formasPago, facturas, ordenesCompra, procesos, parseMonto }){
  const salida = [];
  (formasPago || []).forEach(fp => {
    if(esContratoMensual(fp.Contrato)) return;   // sus etapas van incluidas en la mensualidad
    const proceso = (procesos || []).find(p => mismoContrato(p.NumeroContrato, fp.Contrato)) || null;
    [1, 2, 3, 4, 5, 6].forEach(n => {
      const etapa = String(fp['Pago' + n] || '').trim();
      if(!etapa) return;
      if(String(fp['FacturaPago' + n] || '').trim()) return;
      const cobrada = (facturas || []).some(f => mismoContrato(f.Contrato, fp.Contrato) && norm(f.EtapaContrato) === norm(etapa))
        || (ordenesCompra || []).some(o => mismoContrato(o.Contrato, fp.Contrato) && norm(o.EtapaContrato) === norm(etapa));
      if(cobrada) return;
      const salarios = parseMonto ? parseMonto(fp['ValorPago' + n]) : Number(String(fp['ValorPago' + n] || '').replace(',', '.')) || 0;
      salida.push({ clave: String(fp.id) + ':' + n, fp, n, etapa, salarios, proceso, cumplidaMarcada: fp['EtapaProcesalCumplida' + n] === true || /^(s[ií]|true|1)$/i.test(String(fp['EtapaProcesalCumplida' + n] || '')) });
    });
  });
  return salida;
}

/** Cuántas etapas de las formas de pago se dejaron fuera por ser de un contrato mensual (para decirlo en pantalla). */
export function etapasDeContratosMensuales(formasPago){
  let n = 0;
  (formasPago || []).forEach(fp => { if(esContratoMensual(fp.Contrato)) [1, 2, 3, 4, 5, 6].forEach(i => { if(String(fp['Pago' + i] || '').trim()) n++; }); });
  return n;
}

/** Datos para abrir el borrador de la orden de compra o de la factura de esa etapa (no se guarda hasta «Guardar cambios»). `smmlv` (pesos) es opcional: si se da, el valor sale de salarios × smmlv. */
export function borradorDeCobro(item, { smmlv = 0, clientes = [], hoy = new Date(), etiquetaEtapa = e => e, fmtMonto = v => String(v) } = {}){
  const p = item.proceso || {};
  const cli = (clientes || []).find(c => String(c.RazonSocial || '') === String(p.Cliente || ''));
  const valor = smmlv > 0 && item.salarios > 0 ? item.salarios * smmlv : 0;
  return {
    CodigoCliente: cli ? String(cli.id) : '',
    Contrato: item.fp.Contrato || p.NumeroContrato || '',
    Ciudad: (cli && cli.Ciudad) || 'Bogota D.C',
    Proceso: p.Radicado || '',
    EtapaContrato: item.etapa,
    Observacion: item.salarios > 0 ? String(item.salarios).replace('.', ',') + (item.salarios === 1 ? ' salario mínimo mensual' : ' salarios mínimos mensuales') : '',
    Dia: String(hoy.getDate()),
    Mes: String(hoy.getMonth() + 1).padStart(2, '0'),
    Anio: String(hoy.getFullYear()),
    Descripcion1: 'Honorarios por la etapa ' + etiquetaEtapa(item.etapa) + (p.Radicado ? ' del proceso ' + p.Radicado : '') + (p.Demandante ? ' de ' + p.Demandante : '') + (p.Demandado ? ' contra ' + p.Demandado : ''),
    Cantidad1: '1',
    ValorUnitario1: valor ? fmtMonto(valor) : '',
  };
}
