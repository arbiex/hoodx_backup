# RELATÓRIO: Balance/Saldo via WebSocket - Pragmatic Play

## Resumo Executivo

Este relatório detalha como a Pragmatic Play gerencia consultas de balance/saldo através de WebSocket e requisições HTTP, baseado na análise do arquivo HAR do Blaze.

## 1. Formas de Coletar o Balance

### 1.1 Métodos Disponíveis

A Pragmatic Play oferece **DUAS formas principais** para coletar informações de balance:

#### **Método 1: Requisições HTTP Diretas** ⭐ **PRINCIPAL**
- **Quando**: Conexão inicial e validações periódicas
- **Frequência**: A cada 15-30 segundos ou após eventos
- **Confiabilidade**: Alta (fonte autoritativa)
- **Latência**: Média (200-500ms)

#### **Método 2: WebSocket Events** ⚡ **COMPLEMENTAR**
- **Quando**: Atualizações em tempo real durante o jogo
- **Frequência**: Baseado em eventos (apostas, ganhos)
- **Confiabilidade**: Média (requer validação HTTP)
- **Latência**: Baixa (<100ms)

### 1.2 Fluxo de Coleta Recomendado

```
1. Conectar WebSocket → Estabelecer comunicação
2. Consulta HTTP Inicial → Obter balance autoritativo
3. Escutar WebSocket → Eventos em tempo real
4. Validação HTTP → Sincronizar após transações
```

## 2. Arquitetura de Consulta de Balance

### 2.1 Sistema Híbrido: HTTP + WebSocket

A Pragmatic Play utiliza um sistema híbrido onde:
- **HTTP** é a fonte autoritativa de balance
- **WebSocket** fornece notificações em tempo real
- **Ambos** trabalham em conjunto para máxima precisão

### 2.2 Endpoint Principal de Balance

```
URL: https://games.pragmaticplaylive.net/cgibin/balance.jsp
Método: GET
Tipo: Fonte Autoritativa
```

## 3. Método 1: Coleta via HTTP

### 3.1 Parâmetros Obrigatórios

```
JSESSIONID: _A5axD17Gx7hiKoC6A_gIhUmSArax3N1NQSo6BbNcK3GvTIvy-BS!884315810-9e38118a
ck: 1749574503176 (timestamp/checksum)
game_mode: roulette_desktop
```

### 3.2 Exemplo de URL Completa

```
https://games.pragmaticplaylive.net/cgibin/balance.jsp?JSESSIONID=_A5axD17Gx7hiKoC6A_gIhUmSArax3N1NQSo6BbNcK3GvTIvy-BS!884315810-9e38118a&ck=1749574503176&game_mode=roulette_desktop
```

### 3.3 Estrutura da Resposta XML

```xml
<response>
    <balance>850.50</balance>
    <bonus_balance>0.00</bonus_balance>
    <total_balance>null</total_balance>
</response>
```

### 3.4 Campos Identificados

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `balance` | Decimal | Saldo principal do jogador |
| `bonus_balance` | Decimal | Saldo de bônus disponível |
| `total_balance` | String/Null | Saldo total (pode ser null) |

### 3.5 Quando Usar HTTP

✅ **Recomendado para:**
- Balance inicial ao carregar o jogo
- Validação após apostas/ganhos
- Sincronização periódica
- Recuperação após desconexão WebSocket

❌ **Não recomendado para:**
- Atualizações em tempo real contínuas
- Polling excessivo (>1 req/segundo)

## 4. Método 2: Coleta via WebSocket

### 4.1 Endpoint WebSocket

```
wss://gs9.pragmaticplaylive.net/game?JSESSIONID={session}&tableId={table_id}
```

### 4.2 Parâmetros de Conexão

```
table_id: mrbras531mrbr532
socket_server: wss://gs9.pragmaticplaylive.net/game
token: _A5axD17Gx7hiKoC6A_gIhUmSArax3N1NQSo6BbNcK3GvTIvy-BS!884315810-9e38118a
stats_collector_uuid: 072f45ba-5cd8-45a0-b5dd-588e953e48ed
```

### 4.3 Tipos de Mensagens WebSocket

#### **Conexão Inicial**
```
Tipo: 40 (connect)
Dados: Apenas estabelece conexão
Balance: NÃO incluído
```

#### **Eventos de Jogo**
```
Tipo: 42 (event)
Dados: Eventos de apostas/resultados
Balance: Pode incluir atualizações
```

### 4.4 Quando Usar WebSocket

✅ **Recomendado para:**
- Notificações de mudanças em tempo real
- Eventos de apostas/ganhos
- Atualizações durante o jogo ativo
- Sincronização rápida

❌ **Limitações:**
- Balance não fornecido na conexão inicial
- Requer validação HTTP para precisão
- Dependente de conexão estável

## 5. Identificadores e Códigos

### 5.1 JSESSIONID
- **Formato**: `_A5axD17Gx7hiKoC6A_gIhUmSArax3N1NQSo6BbNcK3GvTIvy-BS!884315810-9e38118a`
- **Função**: Identificação única da sessão
- **Obrigatório**: Sim, em todas as requisições

### 5.2 Checksum (ck)
- **Formato**: Timestamp em milissegundos
- **Exemplo**: `1749574503176`
- **Função**: Validação temporal da requisição

### 5.3 Table ID
- **Formato**: `mrbras531mrbr532`
- **Função**: Identificação da mesa específica

### 5.4 Game Mode
- **Valores**: `roulette_desktop`, `lobby_desktop`
- **Função**: Identificação do tipo de jogo

## 6. Estratégias de Coleta de Balance

### 6.1 Estratégia Conservadora (Apenas HTTP)

```javascript
// Coleta apenas via HTTP - Mais confiável
setInterval(async () => {
    const balance = await getBalanceHTTP();
    updateUI(balance);
}, 30000); // A cada 30 segundos
```

**Vantagens:**
- ✅ Máxima confiabilidade
- ✅ Simples de implementar
- ✅ Menos complexidade

**Desvantagens:**
- ❌ Latência maior
- ❌ Não é tempo real
- ❌ Mais requisições HTTP

### 6.2 Estratégia Híbrida (HTTP + WebSocket) ⭐ **RECOMENDADA**

```javascript
// Combinação de ambos os métodos
let lastBalance = null;

// 1. Balance inicial via HTTP
const initialBalance = await getBalanceHTTP();
updateUI(initialBalance);
lastBalance = initialBalance;

// 2. WebSocket para eventos
ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'bet_placed' || data.type === 'game_result') {
        // Validar via HTTP após eventos importantes
        const currentBalance = await getBalanceHTTP();
        if (currentBalance !== lastBalance) {
            updateUI(currentBalance);
            lastBalance = currentBalance;
        }
    }
};

// 3. Sincronização periódica
setInterval(async () => {
    const balance = await getBalanceHTTP();
    if (balance !== lastBalance) {
        updateUI(balance);
        lastBalance = balance;
    }
}, 60000); // A cada 60 segundos
```

**Vantagens:**
- ✅ Tempo real + Confiabilidade
- ✅ Otimização de requisições
- ✅ Melhor UX

**Desvantagens:**
- ❌ Maior complexidade
- ❌ Gerenciamento de estado

### 6.3 Estratégia Agressiva (WebSocket Primário)

```javascript
// WebSocket como fonte principal
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.balance) {
        updateUI(data.balance);
    }
};

// HTTP apenas para validação ocasional
setInterval(async () => {
    const balance = await getBalanceHTTP();
    validateBalance(balance);
}, 300000); // A cada 5 minutos
```

**Vantagens:**
- ✅ Máxima velocidade
- ✅ Menos requisições HTTP
- ✅ Tempo real

**Desvantagens:**
- ❌ Menor confiabilidade
- ❌ Dependente de WebSocket
- ❌ Risco de dessincronização

## 7. Fluxo de Consulta de Balance

### 7.1 Sequência Temporal Identificada

```
Timestamp        | Método | Balance | Evento
1749574503176   | HTTP   | 850.50  | Conexão inicial
1749574503852   | HTTP   | 850.50  | Validação
1749574527570   | HTTP   | 849.00  | Após aposta (-1.50)
1749574542338   | HTTP   | 850.00  | Após ganho (+1.00)
1749574565991   | HTTP   | 848.50  | Após aposta (-1.50)
1749574583251   | HTTP   | 849.50  | Após ganho (+1.00)
```

### 7.2 Padrões Identificados

1. **Consulta inicial**: Sempre via HTTP
2. **Após apostas**: HTTP para validação
3. **Após ganhos**: HTTP para confirmação
4. **Intervalo médio**: 15-30 segundos entre consultas

## 8. Implementação Prática

### 8.1 Classe para Gerenciamento de Balance

```javascript
class PragmaticBalanceManager {
    constructor(sessionId, tableId, gameMode) {
        this.sessionId = sessionId;
        this.tableId = tableId;
        this.gameMode = gameMode;
        this.currentBalance = null;
        this.ws = null;
        this.updateCallbacks = [];
    }

    // Método 1: HTTP
    async getBalanceHTTP() {
        const timestamp = Date.now();
        const url = `https://games.pragmaticplaylive.net/cgibin/balance.jsp?JSESSIONID=${this.sessionId}&ck=${timestamp}&game_mode=${this.gameMode}`;
        
        const response = await fetch(url, {
            method: 'GET',
            credentials: 'include'
        });
        
        const xmlText = await response.text();
        const parser = new DOMParser();
        const xml = parser.parseFromString(xmlText, 'text/xml');
        
        return {
            balance: parseFloat(xml.querySelector('balance').textContent),
            bonus_balance: parseFloat(xml.querySelector('bonus_balance').textContent),
            total_balance: xml.querySelector('total_balance').textContent,
            timestamp: timestamp,
            source: 'HTTP'
        };
    }

    // Método 2: WebSocket
    connectWebSocket() {
        const wsUrl = `wss://gs9.pragmaticplaylive.net/game?JSESSIONID=${this.sessionId}&tableId=${this.tableId}`;
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = async () => {
            console.log('WebSocket conectado');
            // Obter balance inicial via HTTP
            const balance = await this.getBalanceHTTP();
            this.updateBalance(balance);
        };
        
        this.ws.onmessage = async (event) => {
            const data = JSON.parse(event.data);
            
            // Eventos que podem afetar o balance
            if (data.type === 'bet_placed' || 
                data.type === 'game_result' || 
                data.type === 'balance_update') {
                
                // Validar via HTTP
                const balance = await this.getBalanceHTTP();
                this.updateBalance(balance);
            }
        };
    }

    // Estratégia híbrida
    startHybridCollection() {
        // 1. Conectar WebSocket
        this.connectWebSocket();
        
        // 2. Sincronização periódica via HTTP
        setInterval(async () => {
            const balance = await this.getBalanceHTTP();
            this.updateBalance(balance);
        }, 60000); // A cada 60 segundos
    }

    updateBalance(balance) {
        if (this.currentBalance?.balance !== balance.balance) {
            this.currentBalance = balance;
            this.updateCallbacks.forEach(callback => callback(balance));
        }
    }

    onBalanceUpdate(callback) {
        this.updateCallbacks.push(callback);
    }
}
```

### 8.2 Uso da Classe

```javascript
// Inicializar gerenciador
const balanceManager = new PragmaticBalanceManager(
    sessionId, 
    tableId, 
    'roulette_desktop'
);

// Escutar atualizações
balanceManager.onBalanceUpdate((balance) => {
    console.log(`Balance atualizado: ${balance.balance} (${balance.source})`);
    updateUI(balance);
});

// Iniciar coleta híbrida
balanceManager.startHybridCollection();
```

## 9. Frequência e Otimização

### 9.1 Padrão Identificado

- **HTTP Inicial**: Imediato na conexão
- **HTTP Validação**: Após eventos de jogo
- **HTTP Periódico**: A cada 30-60 segundos
- **WebSocket**: Tempo real para eventos

### 9.2 Otimizações Recomendadas

```javascript
// Rate limiting para HTTP
const httpLimiter = {
    lastCall: 0,
    minInterval: 1000, // 1 segundo mínimo
    
    async call(fn) {
        const now = Date.now();
        if (now - this.lastCall < this.minInterval) {
            await new Promise(resolve => 
                setTimeout(resolve, this.minInterval - (now - this.lastCall))
            );
        }
        this.lastCall = Date.now();
        return fn();
    }
};

// Cache local
const balanceCache = {
    data: null,
    timestamp: 0,
    ttl: 5000, // 5 segundos
    
    get() {
        if (Date.now() - this.timestamp < this.ttl) {
            return this.data;
        }
        return null;
    },
    
    set(data) {
        this.data = data;
        this.timestamp = Date.now();
    }
};
```

## 10. Segurança e Autenticação

### 10.1 Camadas de Segurança

1. **JSESSIONID**: Sessão única por usuário
2. **Checksum temporal**: Validação de timestamp
3. **Token de autenticação**: Incluído nas conexões WebSocket
4. **Table ID específico**: Vinculação à mesa de jogo

### 10.2 Validação de Sessão

- Todas as requisições requerem JSESSIONID válido
- Timeout automático de sessão
- Reconexão automática em caso de desconexão

## 11. Códigos de Erro e Tratamento

### 11.1 Erros HTTP

```javascript
async function getBalanceWithErrorHandling() {
    try {
        const balance = await getBalanceHTTP();
        return balance;
    } catch (error) {
        if (error.status === 401) {
            // Sessão expirada
            await renewSession();
            return getBalanceHTTP();
        } else if (error.status === 429) {
            // Rate limit
            await delay(2000);
            return getBalanceHTTP();
        }
        throw error;
    }
}
```

### 11.2 Erros WebSocket

```javascript
ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    // Fallback para HTTP apenas
    startHTTPPolling();
};

ws.onclose = () => {
    console.log('WebSocket fechado, tentando reconectar...');
    setTimeout(() => {
        connectWebSocket();
    }, 5000);
};
```

## 12. Monitoramento e Métricas

### 12.1 Métricas Importantes

```javascript
const metrics = {
    httpRequests: 0,
    wsMessages: 0,
    balanceUpdates: 0,
    errors: 0,
    avgLatency: 0,
    
    track(type, latency = 0) {
        this[type]++;
        if (latency > 0) {
            this.avgLatency = (this.avgLatency + latency) / 2;
        }
    }
};
```

### 12.2 Logs Recomendados

```javascript
function logBalanceUpdate(balance, source, latency) {
    console.log({
        timestamp: new Date().toISOString(),
        balance: balance.balance,
        bonus_balance: balance.bonus_balance,
        source: source,
        latency: latency,
        sessionId: sessionId.substring(0, 10) + '...'
    });
}
```

## 13. Conclusões e Recomendações

### 13.1 Resumo dos Métodos

| Método | Confiabilidade | Velocidade | Complexidade | Uso Recomendado |
|--------|---------------|------------|--------------|-----------------|
| **HTTP Apenas** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | Aplicações simples |
| **WebSocket Apenas** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | Não recomendado |
| **Híbrido** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | **RECOMENDADO** |

### 13.2 Estratégia Recomendada

1. **Use HTTP como fonte autoritativa** para balance
2. **Use WebSocket para notificações** em tempo real
3. **Implemente cache local** com TTL apropriado
4. **Adicione rate limiting** para requisições HTTP
5. **Monitore métricas** de performance e erros

### 13.3 Implementação Final

A Pragmatic Play implementa um sistema robusto que combina:

1. **HTTP para consultas diretas** com autenticação via JSESSIONID
2. **WebSocket para eventos em tempo real** (mas não balance inicial)
3. **Múltiplas camadas de segurança** (sessão, checksum, tokens)
4. **Estrutura XML padronizada** para respostas HTTP
5. **Identificadores únicos** para cada componente

**⚠️ IMPORTANTE**: O balance **NÃO é fornecido automaticamente** na conexão WebSocket inicial. É necessário fazer uma consulta HTTP separada para obter o balance inicial e usar WebSocket apenas para notificações de eventos.

---

**Nota**: Este relatório é baseado na análise do arquivo HAR capturado da sessão Blaze/Pragmatic Play. Para implementação em ambiente de produção, recomenda-se testes adicionais e validação com a documentação oficial da Pragmatic Play. 