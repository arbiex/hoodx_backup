'use client'

import { useEffect, useRef } from 'react'

interface MatrixRainProps {
  className?: string
}

export default function MatrixRain({ className = '' }: MatrixRainProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Ajustar tamanho do canvas
    const resizeCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    // Caracteres para o efeito Matrix
    const matrixChars = [
      // Símbolos de moeda
      '$', '€', '¥', '₿', '£', '₹', '₩',
      // Números lucky/casino
      '7', '8', '9', '0', '1', '2', '3', '4', '5', '6',
      // Cartas
      'A', 'K', 'Q', 'J', 
      // Palavras de casino
      'W', 'I', 'N', 'J', 'A', 'C', 'K', 'P', 'O', 'T',
      'B', 'E', 'T', 'C', 'A', 'S', 'H',
      // Roulette
      'R', 'O', 'U', 'L', 'E', 'T', 'T', 'E',
      // Binário
      '0', '1',
      // Trading
      'B', 'U', 'Y', 'S', 'E', 'L', 'L',
      // Símbolos especiais
      '▲', '▼', '●', '◆', '★'
    ]

    const fontSize = 14
    const columns = Math.floor(canvas.width / fontSize)
    const drops: number[] = []

    // Inicializar gotas
    for (let i = 0; i < columns; i++) {
      drops[i] = Math.random() * -100
    }

    const draw = () => {
      // Fundo semi-transparente mais forte para criar fade mais suave
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Calcular centro da tela
      const centerX = canvas.width / 2
      const centerY = canvas.height / 2
      const maxDistance = Math.sqrt(centerX * centerX + centerY * centerY)

      // Desenhar cada coluna
      for (let i = 0; i < drops.length; i++) {
        // Posição
        const x = i * fontSize
        const y = drops[i] * fontSize

        // Calcular distância do centro
        const distanceFromCenter = Math.sqrt(
          Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2)
        )
        
        // Normalizar distância (0 = centro, 1 = borda)
        const normalizedDistance = Math.min(distanceFromCenter / maxDistance, 1)
        
        // Criar zona central maior e mais escura
        // Se estiver no centro (30% da tela), praticamente não mostrar nada
        const isInCenterZone = normalizedDistance < 0.3
        
        // Probabilidade de mostrar caractere baseada na distância
        let showProbability
        if (isInCenterZone) {
          // Centro: quase nada (apenas 2% de chance)
          showProbability = 0.02
        } else {
          // Fora do centro: gradual até normal
          showProbability = Math.max(0.3, normalizedDistance * 0.9)
        }
        
        // Skip caracteres no centro com muito mais frequência
        if (Math.random() > showProbability) {
          drops[i]++
          continue
        }
        
        // Caractere aleatório
        const char = matrixChars[Math.floor(Math.random() * matrixChars.length)]
        
        // Opacidade baseada na distância: centro quase invisível, bordas fortes
        let baseOpacity, brightOpacity
        if (isInCenterZone) {
          // Zona central: praticamente invisível
          baseOpacity = 0.01
          brightOpacity = 0.02
        } else {
          // Fora do centro: gradual
          baseOpacity = Math.max(0.1, normalizedDistance * 0.5)
          brightOpacity = Math.max(0.2, normalizedDistance * 0.8)
        }

        // Estilo do texto mais suave para background
        ctx.font = `${fontSize}px monospace`
        
        // Cor base variável baseada na distância
        ctx.fillStyle = `rgba(0, 255, 65, ${baseOpacity})`
        ctx.fillText(char, x, y)

        // Efeito de brilho mais sutil no primeiro caractere
        if (drops[i] * fontSize > 0 && drops[i] * fontSize < fontSize * 1.5) {
          ctx.fillStyle = `rgba(0, 255, 65, ${brightOpacity})`
          ctx.fillText(char, x, y)
        }

        // Reset da gota quando sai da tela
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0
        }

        // Mover gota para baixo
        drops[i]++
      }
    }

    // Modificar a função draw para incluir gradient
    const drawWithGradient = () => {
      // Fundo semi-transparente mais forte para criar fade mais suave
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Calcular centro da tela
      const centerX = canvas.width / 2
      const centerY = canvas.height / 2
      const maxDistance = Math.sqrt(centerX * centerX + centerY * centerY)

      // Desenhar cada coluna
      for (let i = 0; i < drops.length; i++) {
        // Posição
        const x = i * fontSize
        const y = drops[i] * fontSize

        // Calcular distância do centro
        const distanceFromCenter = Math.sqrt(
          Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2)
        )
        
        // Normalizar distância (0 = centro, 1 = borda)
        const normalizedDistance = Math.min(distanceFromCenter / maxDistance, 1)
        
        // Criar zona central maior e mais escura
        // Se estiver no centro (30% da tela), praticamente não mostrar nada
        const isInCenterZone = normalizedDistance < 0.3
        
        // Probabilidade de mostrar caractere baseada na distância
        let showProbability
        if (isInCenterZone) {
          // Centro: quase nada (apenas 2% de chance)
          showProbability = 0.02
        } else {
          // Fora do centro: gradual até normal
          showProbability = Math.max(0.3, normalizedDistance * 0.9)
        }
        
        // Skip caracteres no centro com muito mais frequência
        if (Math.random() > showProbability) {
          drops[i]++
          continue
        }
        
        // Caractere aleatório
        const char = matrixChars[Math.floor(Math.random() * matrixChars.length)]
        
        // Opacidade baseada na distância: centro quase invisível, bordas fortes
        let baseOpacity, brightOpacity
        if (isInCenterZone) {
          // Zona central: praticamente invisível
          baseOpacity = 0.01
          brightOpacity = 0.02
        } else {
          // Fora do centro: gradual
          baseOpacity = Math.max(0.1, normalizedDistance * 0.5)
          brightOpacity = Math.max(0.2, normalizedDistance * 0.8)
        }

        // Estilo do texto mais suave para background
        ctx.font = `${fontSize}px monospace`
        
        // Cor base variável baseada na distância
        ctx.fillStyle = `rgba(0, 255, 65, ${baseOpacity})`
        ctx.fillText(char, x, y)

        // Efeito de brilho mais sutil no primeiro caractere
        if (drops[i] * fontSize > 0 && drops[i] * fontSize < fontSize * 1.5) {
          ctx.fillStyle = `rgba(0, 255, 65, ${brightOpacity})`
          ctx.fillText(char, x, y)
        }

        // Reset da gota quando sai da tela
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0
        }

        // Mover gota para baixo
        drops[i]++
      }

      // Aplicar gradient radial elegante por cima
      const gradient = ctx.createRadialGradient(
        centerX, centerY, 0,                    // Centro
        centerX, centerY, maxDistance * 0.8     // Raio
      )
      
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0.7)')      // Centro bem escuro
      gradient.addColorStop(0.4, 'rgba(0, 0, 0, 0.4)')    // Transição suave
      gradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.1)')    // Meio transparente
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')        // Bordas completamente transparentes

      ctx.globalCompositeOperation = 'multiply'
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.globalCompositeOperation = 'source-over'
    }

    // Animação
    const interval = setInterval(drawWithGradient, 100) // 0.1s por frame

    return () => {
      clearInterval(interval)
      window.removeEventListener('resize', resizeCanvas)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={`fixed inset-0 -z-10 ${className}`}
      style={{ background: 'black' }}
    />
  )
} 