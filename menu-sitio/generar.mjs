// Reparte el menú principal de www.lexaraabogados.com a las páginas de cada sección (2026-11-13): `node menu-sitio/generar.mjs`.
// Copia menu-sitio.css y menu-sitio.js a cada carpeta y deja el MISMO menú (con la opción de esa sección marcada) entre las marcas <!--MENU-SITIO--> de cada HTML.
// El Portal Lexara (la app de React) usa el mismo ITEMS desde src/components/SiteMenu.jsx.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ITEMS } from './items.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, '..');
const css = fs.readFileSync(path.join(aqui, 'menu-sitio.css'), 'utf8');
const js = fs.readFileSync(path.join(aqui, 'menu-sitio.js'), 'utf8');
const navCss = fs.readFileSync(path.join(raiz, 'navidad', 'navidad.css'), 'utf8');
const navJs = fs.readFileSync(path.join(raiz, 'navidad', 'navidad.js'), 'utf8');
const version = crypto.createHash('md5').update(css + js).digest('hex').slice(0, 8);
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const FLECHA = '<svg class="msitio-flecha" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4.2 6 8l4-3.8"/></svg>';

function marcado({ activo, logo, idInicio, extra, oculto }){
  const li = ITEMS.map(it => {
    const esActivo = it.clave === activo;
    const id = it.clave === 'inicio' && idInicio ? ` id="${idInicio}"` : '';
    if(it.sub){
      return `        <li class="tiene-sub"><a href="${esc(it.url)}" class="msitio-sub-btn${esActivo ? ' activo' : ''}" aria-haspopup="true" aria-expanded="false">${esc(it.etiqueta)} ${FLECHA}</a>
          <ul class="msitio-sub">
${it.sub.map(s => `            <li><a href="${esc(s.url)}">${esc(s.etiqueta)}</a></li>`).join('\n')}
          </ul></li>`;
    }
    return `        <li><a${id} href="${esc(it.url)}"${esActivo ? ' class="activo" aria-current="page"' : ''}>${esc(it.etiqueta)}</a></li>`;
  }).join('\n');
  return `<!--MENU-SITIO-->
<header class="msitio" id="menu-sitio"${oculto ? ' hidden' : ''}>
  <div class="msitio-in">
    <a class="msitio-logo" href="${esc(ITEMS[0].url)}" aria-label="Lexara Abogados — ir al inicio"><img src="${esc(logo)}" alt="Lexara Abogados"></a>
    <nav class="msitio-nav" id="msitio-nav" aria-label="Menú principal de Lexara Abogados">
      <ul>
${li}
      </ul>
    </nav>${extra ? `\n    <div class="msitio-extra">${extra}</div>` : ''}
    <button type="button" class="msitio-burger" aria-label="Abrir el menú" aria-expanded="false" aria-controls="msitio-nav"><span></span><span></span><span></span></button>
  </div>
</header>
<!--/MENU-SITIO-->`;
}

const FUENTE = '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;500;600&display=swap" rel="stylesheet">';

const destinos = [
  {
    archivo: 'lexara-al-dia/index.html', activo: 'lexara-al-dia', logo: 'assets/img/logo.png', idInicio: 'enlace-inicio',
    cssRuta: 'assets/css/menu-sitio.css', jsRuta: 'assets/js/menu-sitio.js',
    reemplazar: /<header class="barra">[\s\S]*?<\/header>/,
    extra: html => (/<div class="campana" id="campana" hidden>[\s\S]*?<div class="campana-panel"[^>]*><\/div>\s*<\/div>/.exec(html) || [''])[0],
  },
  {
    archivo: 'portal-clientes/index.html', activo: 'portal-clientes', logo: 'logo.png', oculto: true,   // solo se ve en la pantalla de ingreso (portal.js)
    cssRuta: 'menu-sitio.css', jsRuta: 'menu-sitio.js',
    insertarAntes: '<!-- Ingreso -->',
  },
  {
    archivo: 'links-cpanel/index.html', activo: 'redes', logo: 'logo-menu.png',
    cssRuta: 'menu-sitio.css', jsRuta: 'menu-sitio.js',
    insertarDespues: '<body>',
  },
];

for(const d of destinos){
  const ruta = path.join(raiz, d.archivo);
  if(!fs.existsSync(ruta)){ console.log('omitido (no está en este equipo):', d.archivo); continue; }
  const carpeta = path.dirname(ruta);
  let html = fs.readFileSync(ruta, 'utf8');
  const extra = d.extra ? d.extra(html) : '';
  const bloque = marcado({ activo: d.activo, logo: d.logo, idInicio: d.idInicio, extra, oculto: d.oculto });
  const marcas = /<!--MENU-SITIO-->[\s\S]*?<!--\/MENU-SITIO-->/;
  const extraGuardado = !extra && d.extra ? (marcas.exec(html) ? (/<div class="msitio-extra">([\s\S]*?)<\/div>\s*<button/.exec(html) || [])[1] || '' : '') : '';
  const final = extra || extraGuardado ? marcado({ activo: d.activo, logo: d.logo, idInicio: d.idInicio, extra: extra || extraGuardado, oculto: d.oculto }) : bloque;
  if(marcas.test(html)) html = html.replace(marcas, () => final);
  else if(d.reemplazar) html = html.replace(d.reemplazar, () => final);
  else if(d.insertarAntes) html = html.replace(d.insertarAntes, () => final + '\n\n' + d.insertarAntes);
  else if(d.insertarDespues) html = html.replace(d.insertarDespues, () => d.insertarDespues + '\n' + final + '\n');
  else throw new Error('Sin dónde poner el menú en ' + d.archivo);
  // enlaces a la hoja de estilos, la fuente y el script (una sola vez; si ya están, solo se actualiza la versión)
  const linkCss = `<link rel="stylesheet" href="${d.cssRuta}?v=${version}">`;
  if(/menu-sitio\.css/.test(html)) html = html.replace(/<link rel="stylesheet" href="[^"]*menu-sitio\.css[^"]*">/, () => linkCss);
  else html = html.replace('</head>', () => FUENTE + '\n' + linkCss + '\n</head>');
  const tagJs = `<script src="${d.jsRuta}?v=${version}"></script>`;
  if(/menu-sitio\.js/.test(html)) html = html.replace(/<script src="[^"]*menu-sitio\.js[^"]*"><\/script>/, () => tagJs);
  else html = html.replace('</body>', () => tagJs + '\n</body>');
  // Papá Noel con su trineo halando el logo (navidad/): mismos archivos en cada carpeta, junto a los del menú.
  const navCssRuta = d.cssRuta.replace('menu-sitio.css', 'navidad.css'), navJsRuta = d.jsRuta.replace('menu-sitio.js', 'navidad.js');
  const navVersion = crypto.createHash('md5').update(navCss + navJs).digest('hex').slice(0, 8);
  const navLink = `<link rel="stylesheet" href="${navCssRuta}?v=${navVersion}">`;
  if(/navidad\.css/.test(html)) html = html.replace(/<link rel="stylesheet" href="[^"]*navidad\.css[^"]*">/, () => navLink);
  else html = html.replace('</head>', () => navLink + '\n</head>');
  const navTag = `<script src="${navJsRuta}?v=${navVersion}" data-logo="${d.logo}"></script>`;
  if(/navidad\.js/.test(html)) html = html.replace(/<script src="[^"]*navidad\.js[^"]*"[^>]*><\/script>/, () => navTag);
  else html = html.replace('</body>', () => navTag + '\n</body>');
  fs.writeFileSync(ruta, html);
  fs.writeFileSync(path.join(carpeta, d.cssRuta), css);
  fs.writeFileSync(path.join(carpeta, d.jsRuta), js);
  fs.writeFileSync(path.join(carpeta, navCssRuta), navCss);
  fs.writeFileSync(path.join(carpeta, navJsRuta), navJs);
  console.log('listo:', d.archivo, '(activo: ' + d.activo + ')');
}
console.log('versión', version);
