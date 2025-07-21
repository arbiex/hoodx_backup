# 🚨 Session Affinity - Troubleshooting Loop de Redirecionamentos

## ⚠️ **PROBLEMA RESOLVIDO: Loop Infinito de Redirecionamentos**

### 📋 **Sintomas:**
- Logs mostram redirecionamentos constantes: `🔄 [SESSION-AFFINITY] Redirecionando para instância: xxx`
- Requisições nunca chegam à instância correta
- Status 409 (Conflict) persistente
- Headers `fly-replay` aparecem repetidamente

### 🔍 **Causa Identificada:**
**Dupla verificação de session affinity:**
1. **Middleware** (`src/middleware.ts`) verifica session affinity primeiro
2. **Rota da API** verifica novamente → Loop infinito

### ✅ **Solução Implementada:**

#### **1. Middleware Aprimorado:**
```typescript
// 🆔 BYPASS: Pular chamadas internas (polling, etc)
const isInternalCall = request.headers.get('x-internal-call') === 'true';
if (isInternalCall) {
  return NextResponse.next();
}
```

#### **2. Detecção de Loop:**
```typescript
// 🛡️ PROTEÇÃO: Cookie de contagem de redirecionamentos
private static REDIRECT_COUNT_COOKIE = 'fly-redirect-count';
private static MAX_REDIRECTS = 3;

// Verificar se há loop
static checkForLoop(request: Request): { hasLoop: boolean; redirectCount: number }
```

#### **3. Proteção Automática:**
```typescript
// Se muitos redirecionamentos, forçar aceitação na instância atual
if (redirectCount >= this.MAX_REDIRECTS) {
  console.warn(`⚠️ [SESSION-AFFINITY] Muitos redirecionamentos - forçando aceitação`);
  return true;
}
```

---

## 🧪 **Como Testar a Correção:**

### **1. Verificar Status Atual:**
```bash
# Verificar se ainda há loops
curl -v -c cookies.txt /api/bmgbr3/blaze/pragmatic/blaze-megarouletebr/session-check

# Inspecionar cookies
cat cookies.txt | grep -E "(fly-instance-id|fly-redirect-count)"
```

### **2. Simular Cenário de Loop:**
```javascript
// No browser console
document.cookie = "fly-instance-id=fake-instance-id; path=/";
document.cookie = "fly-redirect-count=5; path=/";

// Fazer requisição - deve funcionar
fetch('/api/bmgbr3/...').then(r => console.log(r.status));
```

### **3. Monitorar Logs:**
```bash
# Deve mostrar proteção ativa
flyctl logs | grep -E "(LOOP|MIDDLEWARE|SESSION-AFFINITY)"
```

---

## 📊 **Indicadores de Sucesso:**

### **✅ Funcionando:**
- Máximo 3 redirecionamentos por requisição
- Logs mostram `"forçando aceitação"` quando necessário
- Chamadas internas (`x-internal-call`) são ignoradas pelo middleware
- Status 200 nas requisições finais

### **❌ Ainda com problemas:**
- Loops continuam após 3 tentativas
- Status 500 com erro "Loop de redirecionamentos detectado"
- Middleware não ignora chamadas internas

---

## 🔧 **Configurações Críticas:**

### **1. Matcher do Middleware:**
```javascript
export const config = {
  matcher: [
    '/api/bmgbr/:path*',
    '/api/bmgbr2/:path*',
    '/api/bmgbr3/:path*'  // ⚡ ERA ISSO QUE ESTAVA FALTANDO!
  ]
};
```

### **2. Headers de Bypass:**
```typescript
// Todas as chamadas internas devem ter este header
headers: {
  'x-internal-call': 'true'
}
```

### **3. Cookies de Controle:**
- `fly-instance-id`: Identifica instância do usuário
- `fly-redirect-count`: Conta redirecionamentos (máx: 3)

---

## 🎯 **Cenários de Teste:**

### **Cenário 1: Primeira Visita**
```bash
# Limpar cookies
curl -c /dev/null /api/bmgbr3/.../session-check

# Resultado esperado: 200 OK + cookie definido
```

### **Cenário 2: Usuário com Cookie Válido**
```bash
# Cookie correto
curl -b "fly-instance-id=current-instance" /api/bmgbr3/...

# Resultado esperado: 200 OK direto
```

### **Cenário 3: Usuário com Cookie de Outra Instância**
```bash
# Cookie de instância diferente
curl -b "fly-instance-id=other-instance" /api/bmgbr3/...

# Resultado esperado: 409 + fly-replay (máx 3 vezes)
```

### **Cenário 4: Chamada Interna**
```bash
# Header de bypass
curl -H "x-internal-call: true" /api/bmgbr3/...

# Resultado esperado: 200 OK (pula middleware)
```

---

## 🚨 **Monitoramento de Produção:**

### **Métricas a Acompanhar:**
```bash
# Contar redirecionamentos por hora
grep "SESSION-AFFINITY.*Redirecionando" logs | wc -l

# Verificar proteções ativas
grep "forçando aceitação" logs | wc -l

# Detectar loops
grep "LOOP DETECTADO" logs | wc -l
```

### **Alertas Recomendados:**
- **> 10 "forçando aceitação" por hora** → Investigar
- **Qualquer "LOOP DETECTADO"** → Alerta crítico
- **> 30% de requisições 409** → Possível problema

---

## 💡 **Lições Aprendidas:**

1. **Middleware + Rota = Conflito** → Sempre verificar duplicação
2. **Headers de bypass são essenciais** → `x-internal-call` salva vidas
3. **Contadores de proteção funcionam** → Evita loops infinitos
4. **Logs detalhados são cruciais** → Para debug rápido

---

**✅ Sistema agora está protegido contra loops infinitos e funciona corretamente!** 