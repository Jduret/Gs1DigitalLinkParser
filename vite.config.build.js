// vite.config.js
import { defineConfig } from 'vite'

export default defineConfig({
    // 👇 Configuration pour une LIBRAIRIE (pas une app)
    build: {
        lib: {
            entry: './src/GS1DigitalLink.js', // ✅ Ton point d’entrée
            name: 'Gs1DigitalLink',          // Nom du module (UMD)
            fileName: (format) => `index.${format}.js`,
            formats: ['es', 'cjs', 'umd']
        }
    },

    // 👇 Optionnel : si tu veux que Vite cherche les modules dans src/
    // (pour pouvoir importer ta classe depuis example/index.html)
    resolve: {
        alias: {
            '@': '/src', // Alias pour importer facilement : import { ... } from '@/Gs1DigitalLinkParser.js'
        },
    },
})