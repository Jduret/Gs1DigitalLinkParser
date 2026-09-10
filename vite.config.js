// vite.config.js
import { defineConfig } from 'vite'

export default defineConfig({
    // 👇 Change la racine du serveur à 'example'
    root: 'examples',

    // 👇 Optionnel : si tu veux que Vite cherche les modules dans src/
    // (pour pouvoir importer ta classe depuis example/index.html)
    resolve: {
        alias: {
            '@': '/src', // Alias pour importer facilement : import { ... } from '@/Gs1DigitalLinkParser.js'
        },
    },

    // 👇 Optionnel : si tu veux que Vite serve des fichiers statiques depuis example/
    // (déjà géré par défaut car root = example)
})