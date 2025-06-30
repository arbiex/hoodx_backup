'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function DebugPage() {
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [blazeToken, setBlazeToken] = useState('');

  const runTest = async (action: string) => {
    setLoading(true);
    setResults(null);
    
    try {
      console.log(`🧪 [DEBUG] Executando teste: ${action}`);
      
      const response = await fetch('/api/debug-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          blazeToken,
          action
        })
      });

      const data = await response.json();
      console.log(`📊 [DEBUG] Resultado ${action}:`, data);
      setResults({ action, ...data });
      
    } catch (error) {
      console.error(`❌ [DEBUG] Erro no teste ${action}:`, error);
      setResults({
        action,
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      });
    } finally {
      setLoading(false);
    }
  };

  const runAllTests = async () => {
    const tests = ['test-simple-get', 'test-token-validity', 'test-blaze-direct'];
    
    for (const test of tests) {
      console.log(`🔄 [DEBUG] Executando ${test}...`);
      await runTest(test);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Aguardar 2s entre testes
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">🔍 Debug de Autenticação</h1>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Configuração</CardTitle>
          <CardDescription>Configure seu token da Blaze para os testes</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Token da Blaze:</label>
              <input
                type="password"
                value={blazeToken}
                onChange={(e) => setBlazeToken(e.target.value)}
                placeholder="Cole seu token da Blaze aqui..."
                className="w-full p-2 border rounded-md"
              />
            </div>
            <p className="text-sm text-gray-600">
              💡 Seu token está em: Configurações → Tokens de Casino → BLAZE
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Testes Individuais</CardTitle>
          <CardDescription>Execute testes específicos para identificar o problema</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              onClick={() => runTest('test-simple-get')}
              disabled={loading}
              variant="outline"
            >
              🌐 Teste Conectividade
            </Button>
            
            <Button
              onClick={() => runTest('test-token-validity')}
              disabled={loading || !blazeToken}
              variant="outline"
            >
              🔐 Teste Token
            </Button>
            
            <Button
              onClick={() => runTest('test-blaze-direct')}
              disabled={loading || !blazeToken}
              variant="outline"
            >
              🔥 Teste Autenticação
            </Button>
          </div>
          
          <div className="mt-4">
            <Button
              onClick={runAllTests}
              disabled={loading || !blazeToken}
              className="w-full"
            >
              🚀 Executar Todos os Testes
            </Button>
          </div>
        </CardContent>
      </Card>

      {results && (
        <Card>
          <CardHeader>
            <CardTitle>
              Resultado: {results.action}
              {results.success ? ' ✅' : ' ❌'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <strong>Status:</strong> {results.success ? 'Sucesso' : 'Falha'}
              </div>
              
              {results.status && (
                <div>
                  <strong>HTTP Status:</strong> {results.status}
                </div>
              )}
              
              {results.error && (
                <div>
                  <strong>Erro:</strong> 
                  <pre className="mt-2 p-2 bg-red-50 border rounded text-sm">
                    {results.error}
                  </pre>
                </div>
              )}
              
              {results.responsePreview && (
                <div>
                  <strong>Resposta (preview):</strong>
                  <pre className="mt-2 p-2 bg-gray-50 border rounded text-sm overflow-auto max-h-40">
                    {results.responsePreview}
                  </pre>
                </div>
              )}
              
              {results.isCloudflareError && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                  ⚠️ <strong>Erro do Cloudflare detectado!</strong> 
                  Este é o problema que estamos tentando resolver.
                </div>
              )}
              
              {results.tokenValid !== undefined && (
                <div>
                  <strong>Token válido:</strong> {results.tokenValid ? 'Sim ✅' : 'Não ❌'}
                </div>
              )}
              
              {results.canConnectToBlaze !== undefined && (
                <div>
                  <strong>Conectividade com Blaze:</strong> {results.canConnectToBlaze ? 'OK ✅' : 'Falha ❌'}
                </div>
              )}
              
              <details className="mt-4">
                <summary className="cursor-pointer font-medium">Ver dados completos</summary>
                <pre className="mt-2 p-2 bg-gray-50 border rounded text-xs overflow-auto max-h-60">
                  {JSON.stringify(results, null, 2)}
                </pre>
              </details>
            </div>
          </CardContent>
        </Card>
      )}
      
      {loading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span>Executando teste...</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 