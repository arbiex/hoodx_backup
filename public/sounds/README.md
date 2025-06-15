# Alertas Sonoros - HoodX

Esta pasta contém os arquivos de som para os alertas do sistema.

## Arquivos de Som Esperados

- `pattern-detected.mp3` - Som para quando padrões são detectados
- `bet-placed.mp3` - Som para quando uma aposta é realizada
- `win.mp3` - Som para vitórias
- `loss.mp3` - Som para derrotas

## Sons Sintéticos (Fallback)

Se os arquivos MP3 não estiverem disponíveis, o sistema usa sons sintéticos gerados via Web Audio API:

- **Padrão Detectado**: Tom agudo (800Hz)
- **Aposta Realizada**: Tom médio (600Hz)  
- **Vitória**: Tom alto (1000Hz)
- **Derrota**: Tom baixo (300Hz)

## Como Adicionar Sons Personalizados

1. Adicione seus arquivos MP3 nesta pasta com os nomes exatos listados acima
2. Os sons devem ter duração máxima de 2-3 segundos
3. Formato recomendado: MP3, 44.1kHz, estéreo
4. Volume normalizado para evitar sons muito altos

## Controles

- Use o componente AudioControls no dashboard para:
  - Habilitar/desabilitar sons
  - Ajustar volume (0-100%)
  - Testar todos os sons 