import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build para el SEGUNDO sitio en vivo: hosting propio por cPanel
// (https://www.lexaraabogados.com/app/) — confirmado 2026-08-25 ("prefiero
// dejar dos activos", junto al de GitHub Pages de siempre). Config aparte
// (no una sola con variable de entorno) para que un `npm run build` normal
// nunca pueda usar por accidente la base equivocada y romper GitHub Pages —
// `BUILD_TARGET=cpanel` como variable de entorno no funciona igual en
// Windows (cmd.exe) que en Bash, así que se evitó esa vía.
//
// Uso: `npm run build:cpanel` (ver package.json). Produce `dist-cpanel/`
// (base '/app/') — nunca toca `dist/`, que sigue siendo exclusivo del build
// de GitHub Pages (vite.config.js). El archivo de salida `index.html` hay
// que renombrarlo a `lexara-gestion-procesos.html` antes de subirlo a
// cPanel (mismo nombre ya registrado como URI de redirección en Azure AD
// para este segundo sitio). Ver [[project_deploy_workflow]] para el paso a
// paso completo (armar el paquete, subirlo por el Administrador de
// archivos de cPanel, extraerlo en public_html/app/).
export default defineConfig({
  plugins: [react()],
  base: '/app/',
  build: {
    outDir: 'dist-cpanel',
  },
});
