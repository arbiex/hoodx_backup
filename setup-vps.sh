#!/bin/bash

# Script de Configuração Inicial do VPS - HoodX
# Execute este script no seu VPS para configurar o ambiente

set -e

# Cores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🔧 Configurando VPS para HoodX...${NC}"

# Atualizar sistema
echo -e "${BLUE}📦 Atualizando sistema...${NC}"
apt update && apt upgrade -y

# Instalar dependências básicas
echo -e "${BLUE}⚙️  Instalando dependências...${NC}"
apt install -y curl wget git build-essential

# Instalar Node.js (via NodeSource)
echo -e "${BLUE}📦 Instalando Node.js...${NC}"
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt install -y nodejs

# Instalar PM2 globalmente
echo -e "${BLUE}🚀 Instalando PM2...${NC}"
npm install -g pm2

# Criar diretório do projeto
echo -e "${BLUE}📁 Criando diretório do projeto...${NC}"
mkdir -p /var/www/hoodx
cd /var/www/hoodx

# Configurar Git (substitua pelos seus dados)
echo -e "${YELLOW}⚙️  Configure seu Git:${NC}"
echo -e "${YELLOW}git config --global user.name 'Seu Nome'${NC}"
echo -e "${YELLOW}git config --global user.email 'seu@email.com'${NC}"

# Clonar repositório (você precisará configurar a chave SSH)
echo -e "${BLUE}📥 Para clonar o repositório, execute:${NC}"
echo -e "${YELLOW}git clone git@github.com:arbiex/hoodx.git .${NC}"

# Configurar variáveis de ambiente
echo -e "${BLUE}🔧 Criando arquivo .env.local...${NC}"
cat > .env.local << EOL
# Configuração do Supabase
NEXT_PUBLIC_SUPABASE_URL=https://pcwekkqhcipvghvqvvtu.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjd2Vra3FoY2lwdmdodnF2dnR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg0MDkwNTcsImV4cCI6MjA2Mzk4NTA1N30.s9atBox8lrUba0Cb5qnH_dHTVJQkvwupoS2L6VneXHA
NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjd2Vra3FoY2lwdmdodnF2dnR1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODQwOTA1NywiZXhwIjoyMDYzOTg1MDU3fQ.qokqoM6yHAZRj-iEpNR448fI3Br9Q57dYrF_g0LJHOo
NEXT_PUBLIC_APP_URL=https://hoodx.ai
EOL

# Configuração do PM2
echo -e "${BLUE}⚙️  Criando configuração do PM2...${NC}"
cat > ecosystem.config.js << EOL
module.exports = {
  apps: [{
    name: 'hoodx',
    script: 'npm',
    args: 'start',
    cwd: '/var/www/hoodx',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '1G',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
EOL

# Criar diretório de logs
mkdir -p logs

# Configurar Nginx (opcional)
echo -e "${BLUE}🌐 Configuração do Nginx (opcional):${NC}"
cat > /tmp/nginx-hoodx << EOL
server {
    listen 80;
    server_name hoodx.ai www.hoodx.ai;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOL

echo -e "${GREEN}✅ Configuração inicial concluída!${NC}"
echo -e "${YELLOW}📝 Próximos passos:${NC}"
echo -e "${YELLOW}1. Configure sua chave SSH para o GitHub${NC}"
echo -e "${YELLOW}2. Clone o repositório: git clone git@github.com:arbiex/hoodx.git .${NC}"
echo -e "${YELLOW}3. Execute: npm install${NC}"
echo -e "${YELLOW}4. Execute: npm run build${NC}"
echo -e "${YELLOW}5. Execute: pm2 start ecosystem.config.js${NC}"
echo -e "${YELLOW}6. Configure o Nginx (copie o arquivo /tmp/nginx-hoodx)${NC}" 