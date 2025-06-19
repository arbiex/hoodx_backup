#!/bin/bash

# Script para configurar deploy.sh automaticamente
# Uso: ./configure-deploy.sh IP_DO_VPS

set -e

# Cores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Verificar se IP foi fornecido
if [ -z "$1" ]; then
    echo -e "${RED}❌ Erro: Forneça o IP do VPS${NC}"
    echo -e "${YELLOW}Uso: ./configure-deploy.sh IP_DO_VPS${NC}"
    echo -e "${YELLOW}Exemplo: ./configure-deploy.sh 192.168.1.100${NC}"
    exit 1
fi

VPS_IP="$1"

echo -e "${BLUE}⚙️  Configurando deploy.sh...${NC}"
echo -e "${YELLOW}VPS IP: $VPS_IP${NC}"

# Atualizar deploy.sh com o IP correto
sed -i.bak "s/VPS_HOST=\"seu-vps-ip-ou-dominio\"/VPS_HOST=\"$VPS_IP\"/" deploy.sh

# Verificar se a alteração foi feita
if grep -q "VPS_HOST=\"$VPS_IP\"" deploy.sh; then
    echo -e "${GREEN}✅ deploy.sh configurado com sucesso!${NC}"
    rm deploy.sh.bak  # Remover backup
else
    echo -e "${RED}❌ Erro ao configurar deploy.sh${NC}"
    mv deploy.sh.bak deploy.sh  # Restaurar backup
    exit 1
fi

echo -e "${BLUE}📋 Configuração atual do deploy.sh:${NC}"
echo -e "${YELLOW}VPS_USER: root${NC}"
echo -e "${YELLOW}VPS_HOST: $VPS_IP${NC}"
echo -e "${YELLOW}VPS_PATH: /var/www/hoodx${NC}"

echo -e "${GREEN}🎉 Configuração concluída!${NC}"
echo -e "${YELLOW}Agora você pode usar:${NC}"
echo -e "${YELLOW}./deploy.sh \"sua mensagem de commit\"${NC}" 