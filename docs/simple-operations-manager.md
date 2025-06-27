# Sistema de Gerenciamento de Operações em Tempo Real

## 📋 **Visão Geral**

O sistema de gerenciamento de operações permite monitorar e armazenar estatísticas de apostas em tempo real na tabela `simple_operations_history`. Ele sincroniza automaticamente com o card "OPERAÇÕES" da interface.

## 🏗️ **Arquitetura**

### 1. **Função RPC: `manage_simple_operation`**

Função PostgreSQL que gerencia o ciclo de vida das operações:

```sql
SELECT manage_simple_operation(
  'start',           -- Ação: 'start', 'update', 'end', 'get_active'
  0,                 -- Total de apostas (opcional)
  0.00,              -- Lucro líquido (opcional)
  0.00               -- Créditos consumidos (opcional)
);
```

#### Ações Disponíveis:

- **`start`**: Cria nova operação ativa
- **`update`**: Atualiza operação ativa existente
- **`end`**: Finaliza operação ativa
- **`get_active`**: Busca operação ativa atual

### 2. **Hook: `useSimpleOperationsManager`**

Hook React que encapsula a lógica de interação com a RPC:

```typescript
const operationsManager = useSimpleOperationsManager();

// Iniciar operação
await operationsManager.startOperation({
  totalBets: 0,
  netProfit: 0,
  creditsConsumed: 0
});

// Atualizar em tempo real
await operationsManager.updateOperation({
  totalBets: 5,
  netProfit: 25.50,
  creditsConsumed: 2.50
});

// Finalizar operação
await operationsManager.endOperation({
  totalBets: 10,
  netProfit: 45.00,
  creditsConsumed: 5.00
});
```

## 🔄 **Fluxo de Operação**

### 1. **Início da Operação**
```
Usuário clica "Começar Apostar" 
    ↓
startOperation() é chamada
    ↓
operationsManager.startOperation() cria registro no banco
    ↓
WebSocket conecta com Pragmatic Play
    ↓
Monitoramento inicia (a cada 2 segundos)
```

### 2. **Atualização em Tempo Real**
```
WebSocket recebe resultado da aposta
    ↓
processOperationResult() atualiza operationState[userId].stats
    ↓
startMonitoring() detecta mudança nas estatísticas
    ↓
operationsManager.updateOperation() atualiza banco
    ↓
Card OPERAÇÕES reflete mudanças instantaneamente
```

### 3. **Finalização da Operação**
```
Usuário clica "Parar" ou ocorre erro
    ↓
handleOperate() ou error handler é chamado
    ↓
operationsManager.endOperation() finaliza registro
    ↓
Calcula duração total e marca como 'completed'
    ↓
Monitoramento para
```

## 📊 **Estrutura de Dados**

### Tabela: `simple_operations_history`

```sql
CREATE TABLE simple_operations_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  total_bets integer DEFAULT 0,
  net_profit numeric DEFAULT 0.00,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'stopped')),
  credits_consumed numeric DEFAULT 0.00,
  credit_transaction_id uuid REFERENCES credit_transactions(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

### Interface TypeScript:

```typescript
interface ActiveOperation {
  id: string;
  total_bets: number;
  net_profit: number;
  credits_consumed: number;
  started_at: string;
  status: 'active' | 'completed' | 'stopped';
  duration_seconds: number;
}
```

## 🎯 **Integração com Card OPERAÇÕES**

O card OPERAÇÕES continua buscando dados da API a cada 10 segundos através do endpoint `get-operation-report`, mas agora os dados também são sincronizados em tempo real na tabela `simple_operations_history`.

### Sincronização Dupla:

1. **Tempo Real (2s)**: `operationsManager.updateOperation()` → Banco de dados
2. **Card UI (10s)**: `fetchOperationReport()` → Memory state da API

## 🔒 **Segurança**

- **RLS (Row Level Security)**: Apenas o próprio usuário pode ver/editar suas operações
- **Validação**: Função RPC valida autenticação antes de qualquer operação
- **Constraints**: Banco de dados impede dados inválidos (lucro negativo permitido, apostas ≥ 0)

## 🚀 **Vantagens**

1. **Persistência**: Dados não se perdem em restart do servidor
2. **Histórico Completo**: Todas as operações ficam registradas
3. **Tempo Real**: Atualizações instantâneas via RPC
4. **Performance**: Otimizado para atualizações frequentes
5. **Auditoria**: Timestamps de criação e atualização automáticos

## 📈 **Métricas Disponíveis**

- **Total de Apostas**: Contador incremental
- **Lucro Líquido**: Saldo positivo/negativo em tempo real
- **Duração**: Tempo total da sessão (calculado automaticamente)
- **Status**: Estado atual da operação
- **Créditos Consumidos**: Tracking de gastos (a implementar)

## 🛠️ **Exemplo de Uso**

```typescript
// Em uma página/componente
const operationsManager = useSimpleOperationsManager();

// Verificar se há operação ativa ao carregar
useEffect(() => {
  operationsManager.getActiveOperation();
}, []);

// Iniciar nova operação
const handleStart = async () => {
  const result = await operationsManager.startOperation({
    totalBets: 0,
    netProfit: 0,
    creditsConsumed: 0
  });
  
  if (result.success) {
    console.log('Operação iniciada:', result.operationId);
  }
};

// Atualizar durante execução
const handleUpdate = async (stats) => {
  if (operationsManager.hasActiveOperation()) {
    await operationsManager.updateOperation({
      totalBets: stats.totalBets,
      netProfit: stats.profit,
      creditsConsumed: stats.credits
    });
  }
};

// Finalizar operação
const handleEnd = async () => {
  const result = await operationsManager.endOperation();
  if (result.success) {
    console.log('Operação finalizada em:', result.durationSeconds, 'segundos');
  }
};
```

## 📝 **TODO / Melhorias Futuras**

1. **Cálculo de Créditos**: Implementar tracking real de créditos consumidos
2. **Métricas Avançadas**: Taxa de acerto, sequências completadas, etc.
3. **Notificações**: Alertas em tempo real para eventos importantes
4. **Dashboard**: Visualização gráfica das operações
5. **Backup**: Sincronização com outras tabelas de histórico 