import { useState, useEffect } from 'react';

/**
 * 🔄 Autenticação via SharedWorker
 * Comunicação entre nossa app e aba da Blaze através de SharedWorker
 */

// Definir tipos
interface AuthMessage {
  type: 'auth_request' | 'auth_response' | 'auth_error';
  blazeToken?: string;
  ppToken?: string;
  error?: string;
  timestamp: number;
}

export class SharedWorkerAuth {
  private worker: SharedWorker | null = null;
  private port: MessagePort | null = null;
  private listeners: Map<string, (data: any) => void> = new Map();

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    try {
      // Criar SharedWorker inline
      const workerScript = `
        const ports = new Set();
        const authResults = new Map();
        
        self.addEventListener('connect', function(e) {
          const port = e.ports[0];
          ports.add(port);
          
          console.log('🔄 [SHARED-WORKER] Nova conexão estabelecida');
          
          port.addEventListener('message', function(e) {
            const { type, data, id } = e.data;
            console.log('📨 [SHARED-WORKER] Mensagem recebida:', type, data);
            
            // Reenviar mensagem para todas as outras portas
            ports.forEach(p => {
              if (p !== port) {
                p.postMessage({ type, data, id });
              }
            });
            
            // Armazenar resultado de autenticação
            if (type === 'auth_result') {
              authResults.set(id, data);
              
              // Limpar após 5 minutos
              setTimeout(() => {
                authResults.delete(id);
              }, 5 * 60 * 1000);
            }
          });
          
          port.start();
        });
      `;

      const blob = new Blob([workerScript], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      
      this.worker = new SharedWorker(workerUrl);
      this.port = this.worker.port;
      
      this.port.addEventListener('message', (e) => {
        this.handleMessage(e.data);
      });
      
      this.port.start();
      
      console.log('✅ [SHARED-WORKER] Initialized successfully');
      
    } catch (error) {
      console.error('❌ [SHARED-WORKER] Initialization failed:', error);
    }
  }

  private handleMessage(data: any) {
    const { type, data: payload, id } = data;
    const listener = this.listeners.get(id);
    
    if (listener) {
      listener(payload);
    }
  }

  public async requestAuthentication(blazeToken: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const authId = `auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Setup listener for response
      this.listeners.set(authId, (data) => {
        if (data.success) {
          resolve(data.ppToken);
        } else {
          reject(new Error(data.error || 'Falha na autenticação'));
        }
        this.listeners.delete(authId);
      });
      
      // Generate authentication script to run on Blaze
      const authScript = this.generateBlazeScript(blazeToken, authId);
      
      // Open Blaze tab with instructions
      const blazeWindow = window.open('about:blank', '_blank');
      if (blazeWindow) {
        blazeWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>🔥 Autenticação Blaze</title>
            <style>
              body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                padding: 20px; 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                text-align: center;
              }
              .card { 
                background: rgba(255,255,255,0.1); 
                padding: 30px; 
                border-radius: 15px; 
                backdrop-filter: blur(10px);
                max-width: 500px;
                margin: 50px auto;
              }
              .btn { 
                background: #4CAF50; 
                color: white; 
                padding: 12px 24px; 
                border: none; 
                border-radius: 8px; 
                cursor: pointer; 
                font-size: 16px;
                margin: 10px;
              }
              .btn:hover { background: #45a049; }
              .step { margin: 15px 0; text-align: left; }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>🔒 Autenticação Automática na Blaze</h2>
              
              <div class="step">
                <strong>📋 Instruções:</strong>
                <ol>
                  <li>Clique no botão abaixo para ir à Blaze</li>
                  <li>Faça login na sua conta</li>
                  <li>Clique em "Executar Autenticação"</li>
                  <li>Aguarde a confirmação</li>
                </ol>
              </div>
              
              <button class="btn" onclick="goToBlaze()">
                🌐 Ir para Blaze
              </button>
              
              <button class="btn" onclick="executeAuth()">
                🚀 Executar Autenticação
              </button>
              
              <div id="status" style="margin-top: 20px;"></div>
            </div>
            
            <script>
              // SharedWorker connection
              const worker = new SharedWorker('${URL.createObjectURL(new Blob([`
                const ports = new Set();
                self.addEventListener('connect', function(e) {
                  const port = e.ports[0];
                  ports.add(port);
                  port.addEventListener('message', function(e) {
                    ports.forEach(p => {
                      if (p !== port) p.postMessage(e.data);
                    });
                  });
                  port.start();
                });
              `], { type: 'application/javascript' }))}');
              
              const port = worker.port;
              port.start();
              
              function goToBlaze() {
                window.location.href = 'https://blaze.bet.br';
              }
              
              function executeAuth() {
                ${authScript}
              }
              
              function updateStatus(message, isError = false) {
                const status = document.getElementById('status');
                status.innerHTML = message;
                status.style.color = isError ? '#ff6b6b' : '#4CAF50';
              }
            </script>
          </body>
          </html>
        `);
      }
      
      // Timeout after 2 minutes
      setTimeout(() => {
        if (this.listeners.has(authId)) {
          this.listeners.delete(authId);
          reject(new Error('Timeout na autenticação'));
        }
      }, 2 * 60 * 1000);
    });
  }

  private generateBlazeScript(blazeToken: string, authId: string): string {
    return `
      async function executeAuth() {
        updateStatus('⏳ Iniciando autenticação...');
        
        try {
          if (!window.location.hostname.includes('blaze.bet.br')) {
            throw new Error('Execute esta função apenas na página da Blaze!');
          }
          
          const response = await fetch('/api/games/mega-roulette---brazilian/play', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ${blazeToken}',
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({
              selected_currency_type: 'BRL'
            })
          });
          
          if (response.ok) {
            const data = await response.json();
            
            if (data.url && data.url.includes('token%3D')) {
              const tokenMatch = data.url.match(/token%3D([^%]+)/);
              if (tokenMatch) {
                const ppToken = tokenMatch[1];
                
                // Send result via SharedWorker
                port.postMessage({
                  type: 'auth_result',
                  data: { success: true, ppToken },
                  id: '${authId}'
                });
                
                updateStatus('✅ Autenticação realizada com sucesso! Você pode fechar esta aba.');
                return;
              }
            }
          }
          
          throw new Error('Falha ao extrair ppToken da resposta');
          
        } catch (error) {
          port.postMessage({
            type: 'auth_result',
            data: { success: false, error: error.message },
            id: '${authId}'
          });
          
          updateStatus('❌ Erro: ' + error.message, true);
        }
      }
    `;
  }

  public disconnect() {
    if (this.port) {
      this.port.close();
    }
    if (this.worker) {
      this.worker.port.close();
    }
  }
}

// Hook para usar o SharedWorkerAuth
export function useSharedWorkerAuth() {
  const [auth] = useState(() => new SharedWorkerAuth());
  
  useEffect(() => {
    return () => {
      auth.disconnect();
    };
  }, [auth]);
  
  return {
    requestAuthentication: (blazeToken: string) => auth.requestAuthentication(blazeToken)
  };
} 