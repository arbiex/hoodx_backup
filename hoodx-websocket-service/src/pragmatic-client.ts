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