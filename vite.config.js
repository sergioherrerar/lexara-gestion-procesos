import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Sitio de proyecto en GitHub Pages: https://sergioherrerar.github.io/lexara-gestion-procesos/
// El archivo de entrada se mantiene con el mismo nombre que ya está registrado
// como URI de redirección en Azure AD, para no tener que volver a cambiarlo ahí.
export default defineConfig({
  plugins: [react()],
  base: '/lexara-gestion-procesos/',
  build: {
    rollupOptions: {
      input: 'lexara-gestion-procesos.html',
    },
  },
});
