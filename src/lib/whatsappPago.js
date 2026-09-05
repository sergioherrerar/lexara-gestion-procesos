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

// Nombres femeninos/masculinos más comunes en Colombia — para anteponer
// "señora"/"señor" en el saludo. No existe un campo de Género en Clientes ni
// en Equipo MD, así que es un cálculo por el primer nombre (pedido explícito
// del usuario); nunca va a ser 100% exacto, pero cubre la inmensa mayoría de
// los casos reales del despacho. Con un nombre no reconocido, se usa la
// regla de respaldo "termina en 'a' = señora" (con las excepciones conocidas
// de nombres masculinos que también terminan en 'a').
const NOMBRES_FEMENINOS = new Set(['maria','monica','ana','luisa','laura','sandra','claudia','diana','patricia',
  'carolina','paola','andrea','angela','sofia','sofía','valentina','camila','daniela','natalia','juliana',
  'alejandra','adriana','marcela','viviana','yolanda','martha','marta','gloria','beatriz','carmen','rosa',
  'isabel','ines','inés','esperanza','constanza','ximena','ivonne','yaneth','janeth','liliana','ruth','sara',
  'sarah','jimena','fernanda','gabriela','veronica','verónica','catalina','ines','erika','érika','tatiana',
  'yesenia','yenny','johana','yohana','estefania','estefanía','miriam','esther','soledad','margarita',
  'consuelo','elizabeth','elsa','elena','victoria','luz','nubia','stella','estella','amparo','ofelia',
  'dahiana','ariana','doris','flor','pilar','remedios','cristina','sonia','olga','nancy','deisy','yuliana']);
const NOMBRES_MASCULINOS = new Set(['jose','josé','juan','carlos','luis','jorge','sergio','andres','andrés',
  'alejandro','daniel','felipe','david','miguel','fernando','ricardo','roberto','eduardo','francisco',
  'oscar','óscar','javier','diego','pedro','pablo','manuel','antonio','rafael','alberto','ernesto',
  'gustavo','hernando','german','germán','ivan','iván','camilo','santiago','nicolas','nicolás','mario',
  'raul','raúl','victor','víctor','cesar','césar','gabriel','martin','martín','alfonso','armando',
  'guillermo','enrique','ramiro','rodrigo','samuel','esteban','julio','arturo','hector','héctor',
  'edgar','wilson','giovanny','giovanni','yesid','harold','jhon','john','jonathan','jhonatan','faber']);
const EXCEPCIONES_MASCULINOS_TERMINAN_A = new Set(['luca','jonathan de jesus']);

function generoDePrimerNombre(primerNombre){
  const n = (primerNombre || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if(NOMBRES_FEMENINOS.has(n)) return 'f';
  if(NOMBRES_MASCULINOS.has(n)) return 'm';
  if(EXCEPCIONES_MASCULINOS_TERMINAN_A.has(n)) return 'm';
  if(n.endsWith('a')) return 'f';
  return 'm';
}

// "señora "/"señor " para anteponer al nombre en el saludo — "" si es una
// empresa (no aplica) o no hay nombre.
function tituloPorNombre(nombreCompleto, esEmpresa){
  if(esEmpresa) return '';
  const primerNombre = (nombreCompleto || '').trim().split(/\s+/)[0];
  if(!primerNombre) return '';
  return generoDePrimerNombre(primerNombre) === 'f' ? 'señora ' : 'señor ';
}

// Deja el teléfono en formato "573XXXXXXXXX" (sin "+", como lo pide wa.me),
// agregando el indicativo de Colombia si no lo trae. Devuelve "" si no es un
// CELULAR colombiano válido (10 dígitos que empiezan en 3) — WhatsApp solo
// existe en celulares, nunca en fijos, así que un fijo (ej. "601 654 3210",
// típico en Teléfono de Clientes/empresas) no sirve aunque tenga 10 dígitos.
// Se valida ANTES de abrir wa.me: un número inválido hace que WhatsApp abra
// su propia pantalla de "número no disponible" y descarte el mensaje ya
// escrito — mejor avisar acá que dejarlo abrir roto. Se usa para los
// teléfonos que ya vienen guardados en Clientes/Equipo MD.
export function normalizarTelefonoWaMe(telefono){
  let digitos = (telefono || '').replace(/\D/g, '');
  if(!digitos) return '';
  if(digitos.startsWith('57') && digitos.length > 10) digitos = digitos.slice(2);
  digitos = digitos.replace(/^0+/, '');
  if(!/^3\d{9}$/.test(digitos)) return '';
  return `57${digitos}`;
}

// Países más comunes para "Otro número" — Colombia (+57) es el que pidió el
// usuario como default de la lista; los demás son un complemento razonable
// por si toca escribirle a alguien fuera del país.
export const PAISES_WHATSAPP = [
  { codigo: '57', nombre: 'Colombia (+57)' },
  { codigo: '1', nombre: 'Estados Unidos / Canadá (+1)' },
  { codigo: '34', nombre: 'España (+34)' },
  { codigo: '52', nombre: 'México (+52)' },
  { codigo: '58', nombre: 'Venezuela (+58)' },
  { codigo: '593', nombre: 'Ecuador (+593)' },
  { codigo: '507', nombre: 'Panamá (+507)' },
];

// Arma el número para wa.me a partir del código de país elegido en la lista
// (sin "+") y el número escrito (se le quita cualquier espacio/símbolo).
// Con Colombia se exige el formato real de celular (10 dígitos, empieza en
// 3), porque es el único país donde de verdad sabemos cuál es el formato
// correcto; con los demás países solo se exige un largo razonable, ya que
// no podemos validar el formato exacto de cada uno.
export function normalizarTelefonoManualWaMe(codigoPais, numero){
  const digitos = (numero || '').replace(/\D/g, '');
  if(!digitos) return '';
  if(codigoPais === '57') return /^3\d{9}$/.test(digitos) ? `57${digitos}` : '';
  if(digitos.length < 7 || digitos.length > 12) return '';
  return `${codigoPais}${digitos}`;
}

// Mensaje institucional de recordatorio de pago — texto exacto pedido por
// el usuario 2026-09-04, con saludo según la hora + "señora"/"señor" según
// el primer nombre (a una empresa no se le antepone título).
export function construirMensajePagoWhatsApp(nombreCompleto, urlPago, fecha = new Date()){
  const saludo = saludoSegunHora(fecha);
  const palabras = (nombreCompleto || '').trim().split(/\s+/).filter(Boolean);
  const esEmpresa = esNombreDeEmpresa(palabras);
  const nombreCorto = primerNombreApellido(nombreCompleto);
  const titulo = tituloPorNombre(nombreCompleto, esEmpresa);
  // Evita doble punto cuando el nombre corto ya termina en uno (ej. "S.A.S.").
  const puntoFinal = nombreCorto.endsWith('.') ? '' : '.';
  return `${saludo}${nombreCorto ? ', ' + titulo + nombreCorto : ''}${puntoFinal}\n\n`
    + `Reciba un cordial saludo de parte de MD Abogados SAS.\n\n`
    + `Nos permitimos recordarle que puede realizar el pago de sus obligaciones de manera segura y fácil, a través de nuestro portal oficial de pagos de Davivienda:\n\n`
    + `🔐 Pago Seguro – MD Abogados SAS\n${urlPago}\n\n`
    + `Si tiene alguna inquietud o requiere información adicional sobre su obligación, estaremos atentos para atenderla.\n\n`
    + `Cordialmente,\nMD Abogados SAS`;
}
