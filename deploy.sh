#!/bin/bash

echo "🚀 Starting Pebbling Deployment..."
echo "================================"

# Backend deployment
echo ""
echo "📦 BACKEND DEPLOYMENT"
echo "-------------------"

cp -r cadeautjes-backend/src ~/Desktop/pebbling-backend-clean/
cp cadeautjes-backend/package*.json ~/Desktop/pebbling-backend-clean/
cp cadeautjes-backend/tsconfig.json ~/Desktop/pebbling-backend-clean/

cd ~/Desktop/pebbling-backend-clean

if git diff --quiet; then
    echo "✅ Backend: No changes"
else
    echo "📝 Backend: Pushing changes..."
    git add .
    git commit -m "Update backend: $(date '+%Y-%m-%d %H:%M')"
    git push origin main
    echo "✅ Backend pushed!"
fi

# Frontend deployment
echo ""
echo "📦 FRONTEND DEPLOYMENT"
echo "--------------------"

cd ~/Windsurf/cadeautjes-website

cp -r src ~/Desktop/pebbling-frontend-clean/
cp -r public ~/Desktop/pebbling-frontend-clean/ 2>/dev/null || true
cp package.json ~/Desktop/pebbling-frontend-clean/
cp package-lock.json ~/Desktop/pebbling-frontend-clean/
cp next.config.ts ~/Desktop/pebbling-frontend-clean/ 2>/dev/null || true
cp tailwind.config.* ~/Desktop/pebbling-frontend-clean/ 2>/dev/null || true
cp tsconfig.json ~/Desktop/pebbling-frontend-clean/
cp postcss.config.* ~/Desktop/pebbling-frontend-clean/ 2>/dev/null || true

cd ~/Desktop/pebbling-frontend-clean

if git diff --quiet; then
    echo "✅ Frontend: No changes"
else
    echo "📝 Frontend: Pushing changes..."
    git add .
    git commit -m "Update frontend: $(date '+%Y-%m-%d %H:%M')"
    git push origin main
    echo "✅ Frontend pushed!"
fi

echo ""
echo "================================"
echo "✅ DEPLOYMENT COMPLETE!"
echo ""
echo "🌐 Live URLs:"
echo "   Backend:  https://pebbling-backend.onrender.com"
echo "   Frontend: https://pebbling-frontend.onrender.com"
echo ""
