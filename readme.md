flyctl logs -a roleta-bot

git add -A && git commit -m "fix: correct edge function name from blaze_history_megaroulette to blaze-mg-pragmatic in all references"

git push origin main

flyctl deploy


Problema resolvido: Erro t.mask is not a function
Solução implementada:
✅ Adicionada função sendWebSocketMessage robusta no arquivo blaze-megarouletebr/route.ts
✅ Múltiplos métodos de fallback para envio de mensagens WebSocket:
Método direto: ws.send(message)
Buffer: ws.send(Buffer.from(message, 'utf8'))
String forçada: ws.send(String(message), { binary: false })
Socket direto: ws._socket.write(frame) com frame manual
✅ Função createWebSocketFrame para criar frames WebSocket manualmente
✅ Tratamento robusto de erros em cada método


Como funciona:
A função agora tenta 4 métodos diferentes para enviar mensagens WebSocket:
Primeiro tenta o método normal ws.send()
Se falhar, tenta com Buffer para compatibilidade
Se ainda falhar, força como string com flag binary
Como último recurso, cria frame WebSocket manualmente e envia via socket