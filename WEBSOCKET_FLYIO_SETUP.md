# 🚀 WebSocket Service no Fly.io - Guia Completo

## 📋 **Pré-requisitos**

- [ ] Node.js instalado (v18+)
- [ ] Git instalado  
- [ ] Conta no Fly.io (gratuita)
- [ ] Projeto HoodX funcionando na Vercel

---

## 🎯 **Arquitetura Final**

```
Frontend (Vercel)          WebSocket Service (Fly.io)         Pragmatic Play
     │                              │                             │
     │──── WebSocket Connection ────│──── WebSocket Connection ────│
     │                              │                             │
     │──── HTTP API Calls ──────────│──── Supabase Edge Function ─│
     │                              │                             │
```

**Vantagens:**
- ✅ Conexões WebSocket persistentes (sem timeout de 15s)
- ✅ Isolamento por usuário (cada um tem sua conexão)
- ✅ Custo baixo (~$10/mês)
- ✅ Frontend continua na Vercel (otimizado)

---

## 🛠️ **PASSO 1: Setup Inicial**

### **1.1 Instalar CLI do Fly.io**
```bash
# macOS
brew install flyctl

# Linux/Windows (via curl)
curl -L https://fly.io/install.sh | sh
```

### **1.2 Login no Fly.io**
```bash
flyctl auth login
```

### **1.3 Criar diretório do projeto**
```bash
mkdir hoodx-websocket-service
cd hoodx-websocket-service
```

---

## 📦 **PASSO 2: Configurar Projeto Node.js**

### **2.1 Inicializar projeto**
```bash
npm init -y
```

### **2.2 Instalar dependências**
```bash
# Dependências principais
npm install ws @supabase/supabase-js express cors dotenv

# Dependências de desenvolvimento
npm install -D @types/ws @types/express @types/node typescript ts-node nodemon
```

### **2.3 Criar `tsconfig.json`**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### **2.4 Atualizar `package.json` - scripts**
```json
{
  "name": "hoodx-websocket-service",
  "version": "1.0.0",
  "main": "dist/server.js",
  "scripts": {
    "start": "node dist/server.js",
    "build": "tsc",
    "dev": "nodemon --exec ts-node src/server.ts",
    "test": "echo \"No tests yet\""
  },
  "dependencies": {
    "ws": "^8.14.2",
    "@supabase/supabase-js": "^2.39.0",
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "@types/ws": "^8.5.10",
    "@types/express": "^4.17.21",
    "@types/node": "^20.0.0",
    "typescript": "^5.3.3",
    "ts-node": "^10.9.2",
    "nodemon": "^3.0.2"
  }
}
```

---

## 💻 **PASSO 3: Criar Código do Servidor**

### **3.1 Criar estrutura de pastas**
```bash
mkdir src
touch src/server.ts
touch src/websocket-manager.ts
touch src/pragmatic-client.ts
```

### **3.2 Criar `src/server.ts`**
```typescript
import express from 'express';
import cors from 'cors';
import { WebSocket } from 'ws';
import { WebSocketManager } from './websocket-manager';

const app = express();
const PORT = process.env.PORT || 3000;
const WS_PORT = 8080;

// Middlewares
app.use(cors({
  origin: [
    'https://hoodx.ai',
    'https://hoodx.vercel.app',
    'http://localhost:3000'
  ]
}));
app.use(express.json());

// Inicializar WebSocket Manager
const wsManager = new WebSocketManager();

// Rotas HTTP
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    activeConnections: wsManager.getActiveConnections(),
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/stats', (req, res) => {
  res.json(wsManager.getStats());
});

// Iniciar servidores
const httpServer = app.listen(PORT, () => {
  console.log(`🌐 HTTP Server rodando na porta ${PORT}`);
});

wsManager.start(WS_PORT);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Recebido SIGTERM, fechando servidores...');
  wsManager.shutdown();
  httpServer.close(() => {
    console.log('✅ Servidores fechados');
    process.exit(0);
  });
});
```

### **3.3 Criar `src/websocket-manager.ts`**
```typescript
import { WebSocket, WebSocketServer } from 'ws';
import { PragmaticClient } from './pragmatic-client';
import { createClient } from '@supabase/supabase-js';

interface UserConnection {
  userId: string;
  clientWs: WebSocket;
  pragmaticClient: PragmaticClient | null;
  connectedAt: number;
  lastActivity: number;
}

export class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private connections = new Map<string, UserConnection>();
  private supabase;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  start(port: number) {
    this.wss = new WebSocketServer({ port });
    
    console.log(`🔌 WebSocket Server rodando na porta ${port}`);

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    // Cleanup de conexões inativas a cada 5 minutos
    setInterval(() => {
      this.cleanupInactiveConnections();
    }, 5 * 60 * 1000);
  }

  private handleConnection(ws: WebSocket, req: any) {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const userId = url.searchParams.get('userId');

    if (!userId) {
      console.log('❌ Conexão rejeitada: userId não fornecido');
      ws.close(1008, 'userId é obrigatório');
      return;
    }

    console.log(`🔌 Nova conexão: ${userId}`);

    // Fechar conexão anterior se existir
    if (this.connections.has(userId)) {
      console.log(`🔄 Fechando conexão anterior para ${userId}`);
      this.closeUserConnection(userId);
    }

    // Criar nova conexão
    const connection: UserConnection = {
      userId,
      clientWs: ws,
      pragmaticClient: null,
      connectedAt: Date.now(),
      lastActivity: Date.now()
    };

    this.connections.set(userId, connection);

    // Setup event listeners
    ws.on('message', (message) => {
      this.handleMessage(userId, message.toString());
    });

    ws.on('close', () => {
      console.log(`🔌 Conexão fechada: ${userId}`);
      this.closeUserConnection(userId);
    });

    ws.on('error', (error) => {
      console.error(`❌ Erro WebSocket ${userId}:`, error);
      this.closeUserConnection(userId);
    });

    // Inicializar conexão com Pragmatic
    this.initializePragmaticConnection(userId);
  }

  private async initializePragmaticConnection(userId: string) {
    const connection = this.connections.get(userId);
    if (!connection) return;

    try {
      // Autenticar usuário
      console.log(`🔑 Autenticando usuário ${userId}...`);
      
      const { data, error } = await this.supabase.functions.invoke('machine_learning_blaze_megaroulette', {
        body: { action: 'authenticate', user_id: userId }
      });

      if (error || !data?.success) {
        throw new Error(data?.error || 'Falha na autenticação');
      }

      const jsessionId = data.data.jsessionId;
      
      // Criar cliente Pragmatic
      const pragmaticClient = new PragmaticClient(jsessionId, userId);
      
      // Setup callbacks
      pragmaticClient.on('connected', () => {
        this.sendToClient(userId, {
          type: 'status',
          status: 'connected',
          message: 'Conectado ao Pragmatic Play'
        });
      });

      pragmaticClient.on('message', (data) => {
        this.sendToClient(userId, {
          type: 'game-data',
          data: data
        });
        connection.lastActivity = Date.now();
      });

      pragmaticClient.on('error', (error) => {
        this.sendToClient(userId, {
          type: 'error',
          message: error
        });
      });

      pragmaticClient.on('disconnected', () => {
        this.sendToClient(userId, {
          type: 'status',
          status: 'disconnected',
          message: 'Desconectado do Pragmatic Play'
        });
      });

      // Conectar
      await pragmaticClient.connect();
      connection.pragmaticClient = pragmaticClient;

    } catch (error: any) {
      console.error(`❌ Erro ao conectar ${userId}:`, error.message);
      this.sendToClient(userId, {
        type: 'error',
        message: `Erro na conexão: ${error.message}`
      });
    }
  }

  private handleMessage(userId: string, message: string) {
    const connection = this.connections.get(userId);
    if (!connection) return;

    connection.lastActivity = Date.now();

    try {
      const data = JSON.parse(message);
      
      // Ping/Pong
      if (data.type === 'ping') {
        this.sendToClient(userId, { type: 'pong', timestamp: Date.now() });
        return;
      }

      // Encaminhar para Pragmatic se necessário
      if (data.type === 'bet' && connection.pragmaticClient) {
        connection.pragmaticClient.sendBet(data.payload);
      }

    } catch (error) {
      console.error(`❌ Erro ao processar mensagem de ${userId}:`, error);
    }
  }

  private sendToClient(userId: string, data: any) {
    const connection = this.connections.get(userId);
    if (connection && connection.clientWs.readyState === WebSocket.OPEN) {
      connection.clientWs.send(JSON.stringify(data));
    }
  }

  private closeUserConnection(userId: string) {
    const connection = this.connections.get(userId);
    if (connection) {
      connection.pragmaticClient?.disconnect();
      connection.clientWs.close();
      this.connections.delete(userId);
    }
  }

  private cleanupInactiveConnections() {
    const now = Date.now();
    const INACTIVE_TIMEOUT = 10 * 60 * 1000; // 10 minutos

    for (const [userId, connection] of this.connections) {
      if (now - connection.lastActivity > INACTIVE_TIMEOUT) {
        console.log(`🧹 Limpando conexão inativa: ${userId}`);
        this.closeUserConnection(userId);
      }
    }
  }

  getActiveConnections(): number {
    return this.connections.size;
  }

  getStats() {
    const stats = {
      totalConnections: this.connections.size,
      connections: Array.from(this.connections.values()).map(conn => ({
        userId: conn.userId,
        connectedAt: conn.connectedAt,
        lastActivity: conn.lastActivity,
        pragmaticConnected: conn.pragmaticClient?.isConnected() || false
      }))
    };
    return stats;
  }

  shutdown() {
    console.log('🛑 Fechando todas as conexões...');
    for (const userId of this.connections.keys()) {
      this.closeUserConnection(userId);
    }
    this.wss?.close();
  }
}
```

### **3.4 Criar `src/pragmatic-client.ts`**
```typescript
import { WebSocket } from 'ws';
import { EventEmitter } from 'events';

export class PragmaticClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private jsessionId: string;
  private userId: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(jsessionId: string, userId: string) {
    super();
    this.jsessionId = jsessionId;
    this.userId = userId;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = `wss://games.pragmaticplaylive.net/websocket?JSESSIONID=${this.jsessionId}`;
      
      console.log(`🔌 Conectando ao Pragmatic Play para ${this.userId}...`);
      
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        console.log(`✅ Conectado ao Pragmatic Play: ${this.userId}`);
        this.reconnectAttempts = 0;
        this.startPing();
        this.emit('connected');
        resolve();
      });

      this.ws.on('message', (data) => {
        const message = data.toString();
        this.handleMessage(message);
      });

      this.ws.on('close', () => {
        console.log(`❌ Conexão Pragmatic fechada: ${this.userId}`);
        this.stopPing();
        this.emit('disconnected');
        this.attemptReconnect();
      });

      this.ws.on('error', (error) => {
        console.error(`❌ Erro Pragmatic ${this.userId}:`, error);
        this.emit('error', error.message);
        reject(error);
      });
    });
  }

  private handleMessage(message: string) {
    try {
      // Log para debug
      console.log(`📨 Mensagem Pragmatic ${this.userId}:`, message.substring(0, 100) + '...');

      // Processar tipos específicos de mensagem
      if (message.includes('"pong"')) {
        console.log(`💓 Pong recebido de ${this.userId}`);
        return;
      }

      if (message.includes('gameStarted')) {
        console.log(`🎮 Jogo iniciado para ${this.userId}`);
      }

      if (message.includes('gameResult')) {
        console.log(`🎯 Resultado do jogo para ${this.userId}`);
      }

      // Emitir para o WebSocket Manager
      this.emit('message', message);

    } catch (error) {
      console.error(`❌ Erro ao processar mensagem ${this.userId}:`, error);
    }
  }

  private startPing() {
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const timestamp = Date.now();
        const pingMessage = `{"id":"1","jsonrpc":"2.0","method":"protocol/v1/ping","params":{"time":"${timestamp}","seq":"${timestamp}"}}`;
        this.ws.send(pingMessage);
        console.log(`🏓 Ping enviado para ${this.userId}`);
      }
    }, 30000); // 30 segundos
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log(`❌ Máximo de tentativas de reconexão atingido para ${this.userId}`);
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    console.log(`🔄 Tentativa de reconexão ${this.reconnectAttempts}/${this.maxReconnectAttempts} para ${this.userId} em ${delay}ms`);
    
    setTimeout(() => {
      this.connect().catch(console.error);
    }, delay);
  }

  sendBet(betData: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(betData));
      console.log(`💰 Aposta enviada para ${this.userId}:`, betData);
    } else {
      console.error(`❌ WebSocket não conectado para enviar aposta: ${this.userId}`);
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  disconnect() {
    this.stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
```

---

## 🐳 **PASSO 4: Configurar Deploy**

### **4.1 Criar `Dockerfile`**
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar dependências
RUN npm ci --only=production

# Copiar código fonte
COPY . .

# Build TypeScript
RUN npm run build

# Exposer portas
EXPOSE 3000 8080

# Comando de start
CMD ["npm", "start"]
```

### **4.2 Criar `.dockerignore`**
```
node_modules
npm-debug.log
Dockerfile
.dockerignore
.git
.gitignore
README.md
.env
.nyc_output
coverage
.nyc_output
src/
tsconfig.json
```

### **4.3 Criar `fly.toml`**
```toml
app = "hoodx-websocket"
primary_region = "gru"

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"

# Serviço HTTP (health check, stats)
[[services]]
  internal_port = 3000
  protocol = "tcp"
  
  [services.concurrency]
    type = "connections"
    hard_limit = 25
    soft_limit = 20

  [[services.ports]]
    port = 80
    handlers = ["http"]
    force_https = true

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

# Serviço WebSocket
[[services]]
  internal_port = 8080
  protocol = "tcp"
  
  [services.concurrency]
    type = "connections"
    hard_limit = 100
    soft_limit = 80

  [[services.ports]]
    port = 8080

  [[services.ports]]
    port = 8443
    handlers = ["tls"]
```

---

## 🚀 **PASSO 5: Deploy no Fly.io**

### **5.1 Inicializar app no Fly.io**
```bash
flyctl launch --no-deploy
```

### **5.2 Configurar variáveis de ambiente**
```bash
flyctl secrets set SUPABASE_URL="https://pcwekkqhcipvghvqvvtu.supabase.co"
flyctl secrets set SUPABASE_SERVICE_ROLE_KEY="sua_service_role_key_aqui"
```

### **5.3 Fazer deploy**
```bash
flyctl deploy
```

### **5.4 Verificar se está funcionando**
```bash
# Ver logs
flyctl logs

# Verificar status
flyctl status

# Testar health check
curl https://hoodx-websocket.fly.dev/health
```

---

## 🔗 **PASSO 6: Integrar com Frontend (Vercel)**

### **6.1 Atualizar `src/hooks/useMegaRouletteWebSocket.ts`**

Adicionar no início do arquivo:
```typescript
// Configuração do WebSocket Service
const WS_URL = process.env.NODE_ENV === 'production' 
  ? 'wss://hoodx-websocket.fly.dev:8443'
  : 'ws://localhost:8080';
```

Substituir a função `connectWebSocket`:
```typescript
// Função para conectar WebSocket
const connectWebSocket = useCallback(async () => {
  if (wsRef.current?.readyState === WebSocket.OPEN) {
    addLog('⚠️ WebSocket já está conectado', 'info');
    return;
  }

  try {
    setConnectionStatus('connecting');
    addLog('🔌 Conectando ao serviço WebSocket...', 'info');
    
    const wsUrl = `${WS_URL}?userId=${userId}`;
    console.log('🔍 Conectando em:', wsUrl);
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      addLog('✅ Conectado ao serviço WebSocket', 'success');
      setIsConnected(true);
      setConnectionStatus('connected');
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'status':
          addLog(`📡 ${data.message}`, data.status === 'connected' ? 'success' : 'info');
          break;
          
        case 'game-data':
          // Processar dados do jogo como antes
          processGameData(data.data);
          break;
          
        case 'error':
          addLog(`❌ ${data.message}`, 'error');
          break;
          
        case 'pong':
          // Não precisa logar pong
          break;
          
        default:
          console.log('📨 Mensagem não reconhecida:', data);
      }
    };

    ws.onclose = () => {
      addLog('❌ Conexão WebSocket fechada', 'error');
      setIsConnected(false);
      setConnectionStatus('disconnected');
    };

    ws.onerror = (error) => {
      addLog(`❌ Erro WebSocket: ${error}`, 'error');
      setConnectionStatus('error');
    };

  } catch (error: any) {
    addLog(`❌ Erro na conexão: ${error.message}`, 'error');
    setConnectionStatus('error');
  }
}, [userId, addLog]);
```

---

## ✅ **PASSO 7: Testes e Monitoramento**

### **7.1 Testes Locais**
```bash
# Terminal 1: Rodar o serviço
npm run dev

# Terminal 2: Testar endpoints
curl http://localhost:3000/health
curl http://localhost:3000/stats
```

### **7.2 Testes no Fly.io**
```bash
# Verificar status
flyctl status

# Ver logs em tempo real
flyctl logs -f

# Testar endpoints
curl https://hoodx-websocket.fly.dev/health
curl https://hoodx-websocket.fly.dev/stats
```

---

## 💰 **Custos Estimados**

### **Fly.io (Preços aproximados):**
```
Recursos básicos:
- Shared CPU 1x: ~$1.94/mês (por 720h)
- RAM 256MB: ~$2.32/mês
- Bandwidth: $0.02/GB

Para uso moderado (10-20 usuários simultâneos):
- Total: ~$5-10/mês
```

---

## 🎯 **Resultado Final**

Após completar todos os passos, você terá:

✅ **Frontend na Vercel** (otimizado, sem mudanças grandes)  
✅ **WebSocket Service no Fly.io** (conexões persistentes)  
✅ **Conexões dedicadas por usuário**  
✅ **Reconexão automática**  
✅ **Logs e monitoramento completos**  
✅ **Custo controlado** (~$5-15/mês)  

### **URLs finais:**
- **Frontend:** `https://hoodx.ai` (Vercel)
- **WebSocket:** `wss://hoodx-websocket.fly.dev:8443` (Fly.io)
- **Health Check:** `https://hoodx-websocket.fly.dev/health`
- **Stats:** `https://hoodx-websocket.fly.dev/stats`

---

## 🔧 **Comandos Úteis**

```bash
# Restart da aplicação
flyctl restart

# Escalar recursos (se necessário)
flyctl scale memory 512
flyctl scale vm shared-cpu-2x

# Ver configuração atual
flyctl config show

# Ver secrets configurados
flyctl secrets list

# Conectar ao console (debug)
flyctl ssh console
```

---

> **💡 Dica:** Mantenha o sistema atual funcionando enquanto testa o novo. Depois de validar, você pode migrar completamente! 