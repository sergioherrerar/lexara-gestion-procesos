import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Sitio de proyecto en GitHub Pages: https://sergioherrerar.github.io/lexara-gestion-procesos/
// La fuente es index.html (estándar de Vite). El script de publicación copia
// dist/index.html -> lexara-gestion-procesos.html en la raíz del repo, que es
// el nombre ya registrado como URI de redirección en Azure AD — así nunca
// hay que tocar esa configuración.
//
// La app también vive en un SEGUNDO sitio en vivo, hosting propio por cPanel
// (https://www.lexaraabogados.com/app/) — confirmado 2026-08-25 ("prefiero
// dejar dos activos"). Ese build usa una config APARTE (`vite.config.cpanel.js`,
// `npm run build:cpanel`) para no arriesgar este archivo, que sigue siendo
// exclusivamente el de GitHub Pages. Ver [[project_deploy_workflow]] para el
// paso a paso completo de cada sitio.
export default defineConfig({
  plugins: [react()],
  base: '/lexara-gestion-procesos/',
});
