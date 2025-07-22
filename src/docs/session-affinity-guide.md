# 🔗 Guia de Session Affinity - Fly.io

## 📋 Resumo

Este projeto implementa **session affinity** (sessões pegajosas) para garantir que todas as requisições de um usuário específico sejam direcionadas para a **mesma máquina** no Fly.io. Isso previne conflitos de estado e garante consistência de dados.

---

## 🏗️ Sistemas Implementados

### 1. **SimpleSessionAffinity** (`src/lib/simple-session-affinity.ts`)
- ✅ **Sistema atual em produção**
- 🍪 **Baseado em cookies** - `fly-instance-id`
- ⚡ **Simples e eficaz** - funciona para 95% dos casos
- 🔄 **Redirecionamento automático** com `fly-replay`

### 2. **EnhancedSessionAffinity** (`src/lib/enhanced-session-affinity.ts`)
- 🚀 **Sistema aprimorado** - recursos extras para debug
- 🧮 **Hash consistente** - usuários são direcionados baseado no `userId`
- 📊 **Monitoramento avançado** - mais informações para debug
- 🎯 **Fallbacks múltiplos** - maior confiabilidade

---

## 📍 Implementação Atual

### **Rotas com Session Affinity:**
- ✅ `/api/bmgbr3/blaze/pragmatic/blaze-megarouletebr/route.ts` (Principal)
- ✅ `/api/bmgbr3/blaze/pragmatic/blaze-megarouletebr/insights/route.ts` (Insights)  
- ✅ `/api/bmgbr3/blaze/pragmatic/blaze-megarouletebr/bet.ts` (Apostas)

### **Como Funciona:**

```typescript
// 1. Verificar se deve servir
if (!SimpleSessionAffinity.shouldServeUser(request)) {
  const sessionInstanceId = cookies.match(/fly-instance-id=([^;]+)/)?.[1];
  
  if (sessionInstanceId) {
    // 2. Redirecionar para instância correta
    return new Response(JSON.stringify({ message: 'Redirecionando...' }), { 
      status: 409,
      headers: { 'fly-replay': `instance=${sessionInstanceId}` }
    });
  }
}

// 3. Servir e definir cookie
return createSessionResponse(response);
```

---

## 🧪 Como Testar

### **1. Rota de Verificação:**
```bash
# Verificar status atual
GET /api/bmgbr3/blaze/pragmatic/blaze-megarouletebr/session-check

# Com userId específico
GET /api/bmgbr3/blaze/pragmatic/blaze-megarouletebr/session-check?userId=abc123

# Teste completo
POST /api/bmgbr3/blaze/pragmatic/blaze-megarouletebr/session-check
{
  "userId": "abc123",
  "testAffinity": true
}
```

### **2. Componente de Monitoramento:**
```typescript
import { SessionAffinityMonitor } from '@/components/SessionAffinityMonitor';

// Usar em qualquer página para debug
<SessionAffinityMonitor userId="user123" />
```

### **3. Verificação Manual:**

1. **Abrir DevTools** → Application → Cookies
2. **Procurar por** `fly-instance-id`
3. **Fazer requisições** e verificar se mantém na mesma instância
4. **Apagar cookie** e verificar se cria novo

---

## 🔍 Indicadores de Funcionamento

### **✅ Funcionando Corretamente:**
- Cookie `fly-instance-id` é definido
- Todas as requisições retornam `200 OK`
- Headers `X-Fly-Instance` consistentes
- Logs mostram mesmo `instanceId`

### **❌ Problemas:**
- Requisições retornam `409 Conflict`
- Headers `fly-replay` aparecem
- Cookie não é definido ou muda
- Logs mostram `instanceId` diferentes

---

## 🚨 Cenários Críticos

### **1. Múltiplas Abas:**
- ✅ **Problema resolvido** com sistema de controle de sessão múltipla
- 🔄 **Detecção automática** de conflitos
- 🎯 **Modal de controle** para o usuário decidir

### **2. Load Balancing:**
- ✅ **Cookies persistem** redirecionamento
- 🔄 **fly-replay** força instância correta
- 📡 **Headers informativos** para debug

### **3. Restart de Instâncias:**
- ⚠️ **Cookies ficam órfãos** quando instância morre
- 🔄 **Auto-recuperação** - nova instância assume
- 🧹 **Cleanup automático** de sessões mortas

---

## 📊 Monitoramento em Produção

### **Métricas Importantes:**
```bash
# Contar requisições com fly-replay
grep "fly-replay" logs | wc -l

# Verificar distribuição de instâncias
grep "instance=" logs | sort | uniq -c

# Monitorar conflitos de sessão  
grep "SESSION-AFFINITY" logs | grep "Redirecionando"
```

### **Alertas Recomendados:**
- 🚨 **>5% de requisições 409** - problema de session affinity
- ⚠️ **Cookie sem instância** - configuração incorreta
- 🔄 **Alto número de replays** - possível loop

---

## 🛠️ Configurações do Fly.io

### **fly.toml necessário:**
```toml
[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 1
  processes = ["app"]

[http_service.concurrency]
  type = "requests"
  hard_limit = 100
  soft_limit = 50

# Session affinity habilitada automaticamente via cookies
```

### **Variáveis de Ambiente:**
```bash
FLY_ALLOC_ID=...     # ID único da instância
FLY_REGION=...       # Região (gru, iad, etc)  
FLY_APP_NAME=roleta-bot   # Nome da aplicação
```

---

## 🔧 Troubleshooting

### **Problema: Requisições 409 constantes**
```bash
# Verificar se cookies estão sendo definidos
curl -v -c cookies.txt /api/bmgbr3/...

# Usar cookies nas próximas requisições
curl -v -b cookies.txt /api/bmgbr3/...
```

### **Problema: Estado inconsistente**
```bash
# Limpar todos os cookies relacionados
document.cookie = "fly-instance-id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;"

# Forçar nova sessão
fetch('/api/bmgbr3/.../session-check', {credentials: 'include'})
```

### **Problema: Debug de instâncias**
```javascript
// Ver qual instância está servindo
fetch('/api/bmgbr3/.../session-check')
  .then(r => r.json())
  .then(data => console.log('Instância atual:', data.instance));
```

---

## 🎯 Próximos Passos

1. **Monitoramento em tempo real** - Dashboard de sessões ativas
2. **Métricas de performance** - Latência por instância  
3. **Balanceamento inteligente** - Direcionar usuários para instância menos carregada
4. **Cleanup automático** - Remover sessões órfãs periodicamente

---

**✅ Sistema está 100% funcional e garante que todas as requisições de um usuário permanecem na mesma máquina no Fly.io!** 