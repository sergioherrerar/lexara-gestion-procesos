// "Enviar pago por WhatsApp" (Informes) — pedido explícito del usuario
// 2026-09-04: mandar por WhatsApp, a un Cliente o a alguien de Equipo MD (o
// a un número escrito a mano), un mensaje institucional con el mismo link
// de "Pago Seguro MD ABOGADOS" que ya usa el informe HTML del cliente
// (ver exportarInformeCliente.js). El saludo cambia según la hora del clic
// y el nombre se acorta a "primer nombre + primer apellido" — nunca el
// nombre completo ni la razón social completa de una empresa.

// Franjas horarias estándar en español: mañana/tarde/noche (el usuario pidió
// explícitamente "buenos días"/"buenas tardes"; se agrega "buenas noches"
// para que el mensaje no quede raro si se manda de noche).
export function saludoSegunHora(fecha = new Date()){
  const hora = fecha.getHours();
  if(hora < 12) return 'Buenos días';
  if(hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

// Palabras que delatan una razón social (empresa), no el nombre de una
// persona — en ese caso no se puede partir en "nombre + apellido" de forma
// confiable, así que se deja tal cual viene.
const SUFIJOS_EMPRESA = ['sas', 's.a.s', 'ltda', 'ltd', 's.a', 'sa', 'eu', 'e.u', 'cia', 'eps', 'ips', 'ese'];

function esNombreDeEmpresa(palabras){
  return palabras.some(p => SUFIJOS_EMPRESA.includes(p.toLowerCase().replace(/\.+$/, '')));
}

// "Primer nombre + primer apellido", asumiendo la convención colombiana
// Nombre1 [Nombre2] Apellido1 [Apellido2] — con 3 o más palabras, la
// inmensa mayoría de los nombres reales del despacho son "Nombre1 Nombre2
// Apellido1" (ej. "Sergio Alexander Herrera", "Monica Paola Gómez"), no
// "Nombre1 Apellido1 Apellido2"; por eso el primer apellido siempre se toma
// de la 3ra palabra en adelante, nunca de la 2da. Con nombres de empresa, o
// de una sola palabra, se devuelve tal cual.
export function primerNombreApellido(nombreCompleto){
  const nombre = (nombreCompleto || '').trim();
  if(!nombre) return '';
  const palabras = nombre.split(/\s+/).filter(Boolean);
  if(palabras.length <= 2 || esNombreDeEmpresa(palabras)) return nombre;
  return `${palabras[0]} ${palabras[2]}`; // 3+ palabras: se salta el segundo nombre
}

// Deja el teléfono en formato "57XXXXXXXXXX" (sin "+", como lo pide wa.me),
// agregando el indicativo de Colombia si no lo trae.
export function normalizarTelefonoWaMe(telefono){
  const soloDigitos = (telefono || '').replace(/\D/g, '');
  if(!soloDigitos) return '';
  if(soloDigitos.startsWith('57') && soloDigitos.length > 10) return soloDigitos;
  return `57${soloDigitos.replace(/^0+/, '')}`;
}

// Mensaje institucional de recordatorio de pago, con el mismo texto del
// botón "Pago Seguro MD ABOGADOS" del informe HTML del cliente.
export function construirMensajePagoWhatsApp(nombreCompleto, urlPago, fecha = new Date()){
  const saludo = saludoSegunHora(fecha);
  const nombreCorto = primerNombreApellido(nombreCompleto);
  return `${saludo}${nombreCorto ? ', ' + nombreCorto : ''}.\n\n`
    + `Le escribimos de *MD Abogados SAS* para recordarle que puede realizar el pago de sus obligaciones de forma segura, a través de nuestro portal oficial con Davivienda:\n\n`
    + `*Pago Seguro MD ABOGADOS*\n${urlPago}\n\n`
    + `Si ya realizó su pago, por favor ignore este mensaje. Quedamos atentos ante cualquier duda.\n\n`
    + `MD Abogados SAS`;
}
