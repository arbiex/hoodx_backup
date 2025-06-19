# 🚀 Deploy Automático - HoodX

Este guia explica como configurar deploy automático usando chave SSH para o VPS.

## 📋 Pré-requisitos

- VPS com Ubuntu/Debian
- Chave SSH configurada
- Acesso root ou sudo ao VPS
- Domínio apontando para o VPS (opcional)

## 🔧 **PASSO 1: Configuração no VPS**

### 1.1. Enviar script para o VPS
```bash
scp setup-vps.sh root@seu-vps-ip:/root/
```

### 1.2. Executar no VPS
```bash
ssh root@seu-vps-ip
chmod +x setup-vps.sh
./setup-vps.sh
```

### 1.3. Configurar chave SSH para GitHub no VPS
```bash
# Gerar chave SSH no VPS (se não tiver)
ssh-keygen -t rsa -b 4096 -C "seu@email.com"

# Copiar chave pública
cat ~/.ssh/id_rsa.pub

# Adicionar no GitHub: Settings → SSH Keys → New SSH Key
```

### 1.4. Configurar Git no VPS
```bash
git config --global user.name "Seu Nome"
git config --global user.email "seu@email.com"
```

### 1.5. Clonar repositório no VPS
```bash
cd /var/www/hoodx
git clone git@github.com:arbiex/hoodx.git .
```

### 1.6. Instalar e iniciar aplicação
```bash
npm install
npm run build
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## 🔧 **PASSO 2: Configuração Local**

### 2.1. Editar script de deploy
Abra o arquivo `deploy.sh` e configure:
```bash
VPS_USER="root"                    # Seu usuário do VPS
VPS_HOST="seu-ip-ou-dominio"       # IP ou domínio do VPS
VPS_PATH="/var/www/hoodx"          # Caminho no VPS
```

## 🚀 **PASSO 3: Usar o Deploy**

### 3.1. Deploy com commit automático
```bash
./deploy.sh
```

### 3.2. Deploy com mensagem personalizada
```bash
./deploy.sh "fix: Correção na edge function"
```

### 3.3. Deploy apenas do que está alterado
```bash
./deploy.sh "feat: Nova funcionalidade implementada"
```

## 🌐 **PASSO 4: Configurar Nginx (Opcional)**

### 4.1. Instalar Nginx
```bash
apt install nginx
```

### 4.2. Configurar site
```bash
sudo cp /tmp/nginx-hoodx /etc/nginx/sites-available/hoodx
sudo ln -s /etc/nginx/sites-available/hoodx /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 4.3. SSL com Certbot (Opcional)
```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d hoodx.ai -d www.hoodx.ai
```

## 📊 **Comandos Úteis no VPS**

### Verificar status da aplicação
```bash
pm2 status
pm2 logs hoodx
pm2 monit
```

### Reiniciar aplicação
```bash
pm2 restart hoodx
```

### Ver logs em tempo real
```bash
pm2 logs hoodx --lines 50
```

### Atualizar manualmente
```bash
cd /var/www/hoodx
git pull origin main
npm install
npm run build
pm2 restart hoodx
```

## 🔄 **Fluxo de Deploy**

1. **Local**: Fazer alterações no código
2. **Local**: Executar `./deploy.sh "mensagem"`
3. **Automático**: Script faz commit e push
4. **Automático**: SSH no VPS e faz pull
5. **Automático**: Instala dependências
6. **Automático**: Faz build
7. **Automático**: Reinicia PM2
8. **Concluído**: Aplicação atualizada

## 🚨 **Troubleshooting**

### Erro de permissão SSH
```bash
# No VPS, verificar permissões
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

### Erro de porta ocupada
```bash
# Verificar processos na porta 3000
lsof -i :3000
kill -9 PID_DO_PROCESSO
```

### Erro de memória
```bash
# Verificar uso de memória
free -h
# Aumentar swap se necessário
fallocate -l 2G /swapfile
```

### Logs de erro do PM2
```bash
pm2 logs hoodx --err --lines 100
```

## 📝 **Variáveis de Ambiente**

Certifique-se de que o arquivo `.env.local` no VPS contém:
```env
NEXT_PUBLIC_SUPABASE_URL=https://pcwekkqhcipvghvqvvtu.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anon
NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role
NEXT_PUBLIC_APP_URL=https://hoodx.ai
```

## ✅ **Checklist de Deploy**

- [ ] VPS configurado e rodando
- [ ] Chave SSH configurada
- [ ] Repositório clonado no VPS
- [ ] PM2 configurado e rodando
- [ ] Nginx configurado (opcional)
- [ ] SSL configurado (opcional)
- [ ] Script de deploy testado
- [ ] Variáveis de ambiente definidas

---

**🎉 Agora você pode fazer deploy com um simples comando: `./deploy.sh`** 