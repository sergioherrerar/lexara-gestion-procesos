// Cuenta regresiva de cumpleaños de los colaboradores (Administración → Colaboradores MD, 2026-10-28, pedido del usuario).
// La fecha llega de SharePoint como «1990-03-14T05:00:00Z» (con hora): solo importa el día, el mes y el año de nacimiento.
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

// Próximo cumpleaños desde `hoy`. Devuelve { dias, fecha, edad, texto } o null si la fecha no sirve.
// `dias` = 0 es hoy. Quien nació un 29 de febrero celebra el 28 en los años no bisiestos.
export function proximoCumpleanos(iso, hoy = new Date()){
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if(!m) return null;
  const anioNac = Number(m[1]), mes = Number(m[2]) - 1, dia = Number(m[3]);
  if(mes < 0 || mes > 11 || dia < 1 || dia > 31) return null;
  const hoy0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const enAnio = anio => {
    const d = new Date(anio, mes, dia);
    return d.getMonth() === mes ? d : new Date(anio, mes, 28);
  };
  let prox = enAnio(hoy0.getFullYear());
  if(prox < hoy0) prox = enAnio(hoy0.getFullYear() + 1);
  const dias = Math.round((prox - hoy0) / 86400000);
  return { dias, fecha: prox, edad: prox.getFullYear() - anioNac, texto: `${prox.getDate()} de ${MESES[prox.getMonth()]}` };
}

export function etiquetaDiasCumple(dias){
  if(dias === 0) return '¡Hoy cumple años!';
  if(dias === 1) return 'Mañana';
  return `Faltan ${dias} días`;
}
