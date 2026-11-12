#!/usr/bin/env node
// Agrega una publicación a data/publicaciones.json a partir de su enlace.
//
//   node lexara-al-dia/herramientas/agregar.cjs "<enlace>" "<tipo>" "<título>" ["<descripción>"] ["<AAAA-MM-DD>"] ["<etiqueta1,etiqueta2>"]
//
//   tipo: video | reel | noticia | publicacion
//   La red social se detecta sola por el enlace (Instagram, Facebook, TikTok, YouTube, LinkedIn, X o sitio web).
//   Si no se da la fecha, se usa la de hoy. Las miniaturas de YouTube se toman solas; para las demás redes, guarde la imagen en
//   assets/img/miniaturas/ y escriba su ruta en el campo "miniatura" del JSON.
const fs = require('fs');
const path = require('path');

const [, , enlace, tipo, titulo, descripcion = '', fecha = '', etiquetas = ''] = process.argv;
const TIPOS = ['video', 'reel', 'noticia', 'publicacion'];
if(!enlace || !TIPOS.includes(tipo) || !titulo){
  console.error('Uso: node lexara-al-dia/herramientas/agregar.cjs "<enlace>" "<video|reel|noticia|publicacion>" "<título>" ["<descripción>"] ["<AAAA-MM-DD>"] ["<etiquetas separadas por coma>"]');
  process.exit(1);
}
if(!/^https?:\/\//i.test(enlace)){ console.error('El enlace debe empezar por http:// o https://'); process.exit(1); }

function redDe(url){
  const h = new URL(url).hostname.replace(/^www\./, '');
  if(/instagram\.com$/.test(h)) return 'instagram';
  if(/(facebook\.com|fb\.watch)$/.test(h)) return 'facebook';
  if(/tiktok\.com$/.test(h)) return 'tiktok';
  if(/(youtube\.com|youtu\.be)$/.test(h)) return 'youtube';
  if(/linkedin\.com$/.test(h)) return 'linkedin';
  if(/(^|\.)(x|twitter)\.com$/.test(h)) return 'x';
  return 'web';
}
const hoy = new Date(); const iso = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-' + String(hoy.getDate()).padStart(2, '0');
if(fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)){ console.error('La fecha debe ser AAAA-MM-DD'); process.exit(1); }
const slug = titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);

const archivo = path.join(__dirname, '..', 'data', 'publicaciones.json');
const lista = JSON.parse(fs.readFileSync(archivo, 'utf8'));
const nueva = {
  id: (fecha || iso) + '-' + slug, tipo, titulo, descripcion, fecha: fecha || iso, red: redDe(enlace), url: enlace, miniatura: '', destacada: false,
  etiquetas: etiquetas ? etiquetas.split(',').map(s => s.trim()).filter(Boolean) : [],
};
if(lista.some(p => p.url === enlace)){ console.error('Ese enlace ya está en la lista.'); process.exit(1); }
lista.unshift(nueva);
fs.writeFileSync(archivo, JSON.stringify(lista, null, 2) + '\n');
console.log('Agregada: [' + tipo + ' · ' + nueva.red + '] ' + titulo + ' (' + nueva.fecha + ')');
