import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Sitio de proyecto en GitHub Pages: https://sergioherrerar.github.io/lexara-gestion-procesos/
// La fuente es index.html (estándar de Vite). El script de publicación copia
// dist/index.html -> lexara-gestion-procesos.html en la raíz del repo, que es
// el nombre ya registrado como URI de redirección en Azure AD — así nunca
// hay que tocar esa configuración.
export default defineConfig({
  plugins: [react()],
  base: '/lexara-gestion-procesos/',
});
