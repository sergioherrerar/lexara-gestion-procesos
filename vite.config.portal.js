import { defineConfig } from 'vite';
import path from 'node:path';

// Paquete de EXPORTACIÓN del portal de clientes (2026-11-11): junta los informes reales de la app (Excel y PDF) en un solo archivo, portal-clientes/exportar.js, que el portal carga
// en el navegador (window.PortalExport). Imágenes (membrete, firma, logo del QR) quedan dentro del archivo. En vez de graph.js (inicio de sesión de Microsoft y media app)
// se usa src/portal-graph-stub.js, con copias mínimas de las pocas funciones que los informes necesitan.
// Uso: `npm run build:portal` (deja el archivo en portal-clientes/exportar.js).
export default defineConfig({
  resolve: { alias: [{ find: /^\.\/graph$/, replacement: path.resolve(__dirname, 'src/portal-graph-stub.js') }] },
  build: {
    outDir: 'dist-portal',
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    copyPublicDir: false,
    lib: { entry: path.resolve(__dirname, 'src/portal-export.js'), name: 'PortalExportBundle', formats: ['iife'], fileName: () => 'exportar.js' },
  },
});
