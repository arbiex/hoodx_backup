#!/bin/bash

# Script para configurar chave SSH no VPS
# Uso: ./setup-ssh.sh IP_DO_VPS

set -e

# Cores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Sua chave SSH pública
SSH_PUBLIC_KEY="ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC/yXkMDHikBFT9dXwbhpQYNV+h0qIDK8TCFXUM2eAalsHd2iy0Mh80lu6NrUM0JYn9gBhrhv45nhgXr/pUC6KxqWR11c81nPtAoDV8BCE5BSIWE+G+9p7aeO35ktMJGcmVO8vSzVJmEMbPYpJMUQkumen7FGzCP2AAcrgslTAfuTY/3sKCkfzWjiK8SskZapHqzGYyzxW/xDIC3WaINPzyC6lulJWMHjNocEXCWwSXkW7VK2GqXnovnnE2zT2ZxLKO/YHenzr90uEjARNv0/DxmbTfU8gea06AZVdwWlFtnCW+RvKkyPJPuFxAx2imgLeT8WgUeAapxtVlOlJDwdlR"

# Verificar se IP foi fornecido
if [ -z "$1" ]; then
    echo -e "${RED}❌ Erro: Forneça o IP do VPS${NC}"
    echo -e "${YELLOW}Uso: ./setup-ssh.sh IP_DO_VPS${NC}"
    exit 1
fi

VPS_IP="$1"
VPS_USER="root"  # Altere se necessário

echo -e "${BLUE}🔐 Configurando chave SSH no VPS...${NC}"
echo -e "${YELLOW}VPS: $VPS_IP${NC}"

# Adicionar chave SSH ao VPS
echo -e "${BLUE}📤 Enviando chave SSH para o VPS...${NC}"
ssh $VPS_USER@$VPS_IP "mkdir -p ~/.ssh && chmod 700 ~/.ssh"
echo "$SSH_PUBLIC_KEY" | ssh $VPS_USER@$VPS_IP "cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"

# Testar conexão SSH
echo -e "${BLUE}🔍 Testando conexão SSH...${NC}"
if ssh -o BatchMode=yes -o ConnectTimeout=5 $VPS_USER@$VPS_IP exit; then
    echo -e "${GREEN}✅ Conexão SSH configurada com sucesso!${NC}"
else
    echo -e "${RED}❌ Erro na conexão SSH${NC}"
    exit 1
fi

# Configurar Git no VPS
echo -e "${BLUE}⚙️  Configurando Git no VPS...${NC}"
ssh $VPS_USER@$VPS_IP << EOF
    # Configurar Git
    git config --global user.name "Deploy Bot"
    git config --global user.email "deploy@hoodx.ai"
    
    # Adicionar GitHub aos known_hosts
    ssh-keyscan -H github.com >> ~/.ssh/known_hosts
    
    echo "Git configurado com sucesso!"
EOF

echo -e "${GREEN}🎉 Configuração SSH concluída!${NC}"
echo -e "${YELLOW}Agora você pode executar:${NC}"
echo -e "${YELLOW}./deploy.sh \"sua mensagem de commit\"${NC}" 