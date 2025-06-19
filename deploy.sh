#!/bin/bash

# Script de Deploy Automático - HoodX
# Uso: ./deploy.sh "mensagem do commit"

set -e  # Para o script em caso de erro

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configurações (ajuste conforme necessário)
VPS_USER="root"  # ou seu usuário
VPS_HOST="seu-vps-ip-ou-dominio"
VPS_PATH="/var/www/hoodx"  # caminho no VPS onde está o projeto
BRANCH="main"

echo -e "${BLUE}🚀 Iniciando deploy automático...${NC}"

# Verificar se há mudanças
if [ -z "$(git status --porcelain)" ]; then
    echo -e "${YELLOW}⚠️  Nenhuma mudança detectada. Criando commit vazio...${NC}"
    COMMIT_MSG="${1:-chore: Deploy trigger $(date +'%Y-%m-%d %H:%M:%S')}"
    git commit --allow-empty -m "$COMMIT_MSG"
else
    # Adicionar todas as mudanças
    echo -e "${BLUE}📝 Adicionando mudanças...${NC}"
    git add .
    
    # Commit com mensagem
    COMMIT_MSG="${1:-feat: Auto deploy $(date +'%Y-%m-%d %H:%M:%S')}"
    echo -e "${BLUE}💾 Fazendo commit: $COMMIT_MSG${NC}"
    git commit -m "$COMMIT_MSG"
fi

# Push para o repositório
echo -e "${BLUE}⬆️  Fazendo push para origin/$BRANCH...${NC}"
git push origin $BRANCH

# Deploy no VPS
echo -e "${BLUE}🚀 Iniciando deploy no VPS...${NC}"

ssh $VPS_USER@$VPS_HOST << EOF
    set -e
    
    echo "🔄 Acessando diretório do projeto..."
    cd $VPS_PATH
    
    echo "⬇️  Fazendo pull das mudanças..."
    git pull origin $BRANCH
    
    echo "📦 Instalando dependências..."
    npm install
    
    echo "🏗️  Fazendo build..."
    npm run build
    
    echo "🔄 Reiniciando serviços..."
    # PM2 restart (se usando PM2)
    pm2 restart hoodx || echo "PM2 não encontrado ou app não configurado"
    
    # Ou se usando systemd:
    # sudo systemctl restart hoodx
    
    # Ou se usando Docker:
    # docker-compose down && docker-compose up -d --build
    
    echo "✅ Deploy concluído com sucesso!"
EOF

echo -e "${GREEN}✅ Deploy automático concluído!${NC}"
echo -e "${GREEN}🌐 Acesse: https://hoodx.ai${NC}" 