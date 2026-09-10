#!/usr/bin/env bash

# ================================================
# publish.sh - Publie ta librairie Gs1DigitalLinkParser sur npm ou un registry local
# ================================================

set -e  # Arrête si une commande échoue

echo "🚀 Début du processus de publication..."

# 1. Supprime l'ancien dist/ et rebuild
echo "🔧 Nettoyage et build de la librairie..."
rm -rf dist/
npm run build

# 2. Vérifie que les 3 fichiers attendus existent
EXPECTED_FILES=(
  "dist/index.es.js"
  "dist/index.cjs.js"
  "dist/index.umd.js"
)

echo "🔍 Vérification des fichiers de build..."
for file in "${EXPECTED_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    echo "❌ Erreur : Le fichier attendu '$file' est manquant !"
    exit 1
  else
    echo "✅ $file ✅"
  fi
done

echo "🎉 Tous les fichiers de build sont présents !"

# 3. Vérifie que package.json est valide
if [ ! -f "package.json" ]; then
  echo "❌ Erreur : package.json introuvable !"
  exit 1
fi

# 4. Crée le package .tgz
echo "📦 Création du package npm..."
npm pack

# 5. Récupère le nom du fichier .tgz généré
TAR_FILE=$(ls -1t *.tgz | head -n1)
if [ -z "$TAR_FILE" ]; then
  echo "❌ Erreur : Aucun fichier .tgz généré !"
  exit 1
fi

echo "📁 Package créé : $TAR_FILE"

# 6. Demande où publier
echo ""
echo "🌍 Où veux-tu publier ?"
echo "1. npm public (https://registry.npmjs.org/)"
echo "2. Registry local (ex: verdaccio http://localhost:4873)"
read -p "Choisis 1 ou 2 : " choice

case $choice in
  1)
    echo "🚀 Publication sur npm public..."
    npm publish
    echo "🎉 ✅ Publié sur npm !"
    ;;
  2)
    LOCAL_REGISTRY="http://localhost:4873"
    read -p "Entrez l'URL de ton registry local (ex: $LOCAL_REGISTRY) : " registry
    registry=${registry:-$LOCAL_REGISTRY}

    echo "🚀 Publication sur $registry..."
    npm publish --registry "$registry"
    echo "🎉 ✅ Publié sur $registry !"
    ;;
  *)
    echo "❌ Choix invalide. Abandon."
    exit 1
    ;;
esac

# 7. Nettoyage optionnel (décommente si tu veux)
# rm -f $TAR_FILE

echo ""
echo "✨ Félicitations ! Ta librairie est maintenant publiée. 🚀"
echo "Tu peux l'installer avec : npm install gs1-digital-link-parser"