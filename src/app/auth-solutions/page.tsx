'use client';

import { useState, useEffect } from 'react';
import { useFrontendAuth, generateConsoleScript } from '@/lib/frontend-auth';
import { createBookmarkletInstructions } from '@/lib/bookmarklet-auth';
import { useSharedWorkerAuth } from '@/lib/shared-worker-auth';
import { useAuth } from '@/hooks/useAuth';

export default function AuthSolutionsPage() {
  const { user } = useAuth();
  const frontendAuth = useFrontendAuth();
  const sharedWorkerAuth = useSharedWorkerAuth();
  
  const [blazeToken, setBlazeToken] = useState('');
  const [selectedSolution, setSelectedSolution] = useState<'console' | 'bookmarklet' | 'sharedworker'>('console');

  // Carregar token da Blaze do usuário
  useEffect(() => {
    if (user?.blazeToken) {
      setBlazeToken(user.blazeToken);
    }
  }, [user]);

  const handleConsoleAuth = async () => {
    if (!blazeToken) {
      alert('❌ Token da Blaze não configurado');
      return;
    }
    
    await frontendAuth.authenticateWithConsole(blazeToken);
  };

  const handleBookmarkletAuth = () => {
    if (!blazeToken) {
      alert('❌ Token da Blaze não configurado');
      return;
    }
    
    const { bookmarkletUrl, instructions } = createBookmarkletInstructions(blazeToken);
    
    // Criar link para arrastar
    const link = document.createElement('a');
    link.href = bookmarkletUrl;
    link.textContent = '🔥 Autenticar na Blaze';
    link.style.cssText = `
      background: #ff4444;
      color: white;
      padding: 12px 24px;
      text-decoration: none;
      border-radius: 8px;
      font-weight: bold;
      display: inline-block;
      margin: 10px 0;
    `;
    
    const container = document.getElementById('bookmarklet-container');
    if (container) {
      container.innerHTML = '';
      container.appendChild(link);
    }
  };

  const handleSharedWorkerAuth = async () => {
    if (!blazeToken) {
      alert('❌ Token da Blaze não configurado');
      return;
    }
    
    try {
      const ppToken = await sharedWorkerAuth.requestAuthentication(blazeToken);
      alert(`✅ ppToken gerado: ${ppToken}`);
    } catch (error) {
      alert(`❌ Erro: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8 text-center">
        🚀 3 Soluções de Autenticação Frontend
      </h1>
      
      <div className="mb-6 p-4 bg-blue-50 rounded-lg">
        <h2 className="text-xl font-semibold mb-2">ℹ️ Como Funcionava na Edge Function</h2>
        <p className="text-gray-700">
          A Edge Function fazia <strong>2 requisições sequenciais</strong>:
        </p>
        <ol className="list-decimal list-inside mt-2 space-y-1">
          <li><strong>1ª Etapa:</strong> POST para Blaze → gerar ppToken</li>
          <li><strong>2ª Etapa:</strong> GET para Pragmatic → gerar jsessionId</li>
        </ol>
        <p className="mt-2 text-red-600">
          <strong>Problema:</strong> Cloudflare bloqueava IP do servidor Fly.io
        </p>
        <p className="text-green-600">
          <strong>Solução:</strong> Executar no browser do usuário (IP real)
        </p>
      </div>

      {/* Configuração do Token */}
      <div className="mb-8 p-4 bg-gray-50 rounded-lg">
        <label className="block text-sm font-medium mb-2">
          🔑 Token da Blaze:
        </label>
        <input
          type="text"
          value={blazeToken}
          onChange={(e) => setBlazeToken(e.target.value)}
          placeholder="Insira seu token da Blaze..."
          className="w-full p-3 border rounded-lg"
        />
      </div>

      {/* Seletor de Solução */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">🎯 Escolha a Solução:</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              id: 'console' as const,
              title: '📱 Script no Console',
              description: 'Usuário executa script no console da Blaze',
              pros: ['✅ Simples de implementar', '✅ Funciona em qualquer browser', '✅ Sem extensões necessárias'],
              cons: ['❌ Usuário precisa abrir console', '❌ Copiar/colar script']
            },
            {
              id: 'bookmarklet' as const,
              title: '📋 Bookmarklet',
              description: 'Usuário adiciona favorito e clica na Blaze',
              pros: ['✅ Um clique apenas', '✅ Reutilizável', '✅ Interface visual'],
              cons: ['❌ Usuário precisa arrastar link', '❌ Pode não funcionar em mobile']
            },
            {
              id: 'sharedworker' as const,
              title: '🔄 SharedWorker',
              description: 'Comunicação entre abas via SharedWorker',
              pros: ['✅ Automático', '✅ Interface bonita', '✅ Melhor UX'],
              cons: ['❌ Mais complexo', '❌ Pode ter compatibilidade limitada']
            }
          ].map((solution) => (
            <div
              key={solution.id}
              className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                selectedSolution === solution.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              onClick={() => setSelectedSolution(solution.id)}
            >
              <h3 className="text-lg font-semibold mb-2">{solution.title}</h3>
              <p className="text-gray-600 text-sm mb-3">{solution.description}</p>
              
              <div className="space-y-2">
                <div>
                  <strong className="text-green-600">Vantagens:</strong>
                  <ul className="text-xs text-green-700 mt-1">
                    {solution.pros.map((pro, i) => <li key={i}>{pro}</li>)}
                  </ul>
                </div>
                <div>
                  <strong className="text-red-600">Desvantagens:</strong>
                  <ul className="text-xs text-red-700 mt-1">
                    {solution.cons.map((con, i) => <li key={i}>{con}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Demonstração da Solução Selecionada */}
      <div className="p-6 bg-white border-2 border-gray-200 rounded-lg">
        {selectedSolution === 'console' && (
          <div>
            <h3 className="text-xl font-semibold mb-4">📱 Autenticação via Console</h3>
            <p className="text-gray-600 mb-4">
              Esta solução gera um script que o usuário executa no console da Blaze.
              É a mais confiável porque executa diretamente no contexto da Blaze.
            </p>
            
            <button
              onClick={handleConsoleAuth}
              disabled={!blazeToken || frontendAuth.isAuthenticating}
              className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 disabled:bg-gray-400"
            >
              {frontendAuth.isAuthenticating ? '⏳ Aguardando...' : '🚀 Iniciar Autenticação'}
            </button>
            
            {frontendAuth.authResult && (
              <div className={`mt-4 p-4 rounded-lg ${
                frontendAuth.authResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {frontendAuth.authResult.success ? (
                  <div>
                    <strong>✅ Autenticação bem-sucedida!</strong>
                    <pre className="mt-2 text-xs">
                      {JSON.stringify(frontendAuth.authResult.data, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div>
                    <strong>❌ Erro na autenticação:</strong>
                    <p>{frontendAuth.authResult.error}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {selectedSolution === 'bookmarklet' && (
          <div>
            <h3 className="text-xl font-semibold mb-4">📋 Autenticação via Bookmarklet</h3>
            <p className="text-gray-600 mb-4">
              Esta solução cria um favorito que o usuário pode clicar quando estiver na Blaze.
            </p>
            
            <button
              onClick={handleBookmarkletAuth}
              disabled={!blazeToken}
              className="bg-orange-500 text-white px-6 py-3 rounded-lg hover:bg-orange-600 disabled:bg-gray-400"
            >
              🔗 Gerar Bookmarklet
            </button>
            
            <div id="bookmarklet-container" className="mt-4 p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                Clique em "Gerar Bookmarklet" para criar o link que você deve arrastar para seus favoritos.
              </p>
            </div>
            
            <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
              <h4 className="font-semibold text-yellow-800">📋 Instruções:</h4>
              <ol className="list-decimal list-inside text-sm text-yellow-700 mt-2">
                <li>Gere o bookmarklet acima</li>
                <li>Arraste o link vermelho para sua barra de favoritos</li>
                <li>Vá para blaze.bet.br e faça login</li>
                <li>Clique no favorito "🔥 Autenticar na Blaze"</li>
                <li>Aguarde a confirmação</li>
              </ol>
            </div>
          </div>
        )}

        {selectedSolution === 'sharedworker' && (
          <div>
            <h3 className="text-xl font-semibold mb-4">🔄 Autenticação via SharedWorker</h3>
            <p className="text-gray-600 mb-4">
              Esta solução abre uma nova aba com interface guiada e comunica via SharedWorker.
            </p>
            
            <button
              onClick={handleSharedWorkerAuth}
              disabled={!blazeToken}
              className="bg-purple-500 text-white px-6 py-3 rounded-lg hover:bg-purple-600 disabled:bg-gray-400"
            >
              🌐 Abrir Interface de Autenticação
            </button>
            
            <div className="mt-4 p-4 bg-purple-50 rounded-lg">
              <h4 className="font-semibold text-purple-800">🔄 Como funciona:</h4>
              <ol className="list-decimal list-inside text-sm text-purple-700 mt-2">
                <li>Abre nova aba com interface visual</li>
                <li>Usuário navega para Blaze e faz login</li>
                <li>Clica em "Executar Autenticação" na interface</li>
                <li>SharedWorker comunica resultado de volta</li>
                <li>Resultado aparece aqui automaticamente</li>
              </ol>
            </div>
          </div>
        )}
      </div>

      {/* Comparativo das Soluções */}
      <div className="mt-8 p-6 bg-gray-50 rounded-lg">
        <h3 className="text-xl font-semibold mb-4">📊 Comparativo das Soluções</h3>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Critério</th>
                <th className="text-center py-2">📱 Console</th>
                <th className="text-center py-2">📋 Bookmarklet</th>
                <th className="text-center py-2">🔄 SharedWorker</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2">Facilidade de Uso</td>
                <td className="text-center">⭐⭐</td>
                <td className="text-center">⭐⭐⭐⭐</td>
                <td className="text-center">⭐⭐⭐⭐⭐</td>
              </tr>
              <tr className="border-b">
                <td className="py-2">Compatibilidade</td>
                <td className="text-center">⭐⭐⭐⭐⭐</td>
                <td className="text-center">⭐⭐⭐⭐</td>
                <td className="text-center">⭐⭐⭐</td>
              </tr>
              <tr className="border-b">
                <td className="py-2">Velocidade</td>
                <td className="text-center">⭐⭐⭐⭐⭐</td>
                <td className="text-center">⭐⭐⭐⭐⭐</td>
                <td className="text-center">⭐⭐⭐</td>
              </tr>
              <tr className="border-b">
                <td className="py-2">Complexidade Técnica</td>
                <td className="text-center">⭐⭐</td>
                <td className="text-center">⭐⭐⭐</td>
                <td className="text-center">⭐⭐⭐⭐⭐</td>
              </tr>
              <tr>
                <td className="py-2">UX (Experiência do Usuário)</td>
                <td className="text-center">⭐⭐</td>
                <td className="text-center">⭐⭐⭐⭐</td>
                <td className="text-center">⭐⭐⭐⭐⭐</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Recomendação Final */}
      <div className="mt-8 p-6 bg-green-50 border-2 border-green-200 rounded-lg">
        <h3 className="text-xl font-semibold text-green-800 mb-4">🎯 Solução Perfeita</h3>
        <p className="text-green-700">
          <strong>Executa exatamente a mesma lógica da Edge Function, mas no browser:</strong>
        </p>
        <ol className="list-decimal list-inside text-green-700 mt-2 space-y-1">
          <li><strong>1ª Etapa:</strong> POST blaze.bet.br/api/games/mega-roulette---brazilian/play</li>
          <li><strong>2ª Etapa:</strong> GET games.pragmaticplaylive.net/api/secure/GameLaunch</li>
          <li><strong>Resultado:</strong> ppToken + jsessionId gerados com IP real do usuário</li>
        </ol>
        <p className="mt-4 text-green-600 text-sm">
          💡 <strong>Funciona para QUALQUER usuário porque usa o IP real deles!</strong>
        </p>
      </div>
    </div>
  );
} 