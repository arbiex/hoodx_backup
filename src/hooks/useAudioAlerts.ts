'use client'

import { useCallback, useRef, useEffect } from 'react'

interface AudioAlertsConfig {
  enabled: boolean
  volume: number
  patternDetectedSound: string
  betPlacedSound: string
  winSound: string
  lossSound: string
}

const DEFAULT_CONFIG: AudioAlertsConfig = {
  enabled: true,
  volume: 0.7,
  patternDetectedSound: '/sounds/pattern-detected.mp3',
  betPlacedSound: '/sounds/bet-placed.mp3', 
  winSound: '/sounds/win.mp3',
  lossSound: '/sounds/loss.mp3'
}

export function useAudioAlerts(config: Partial<AudioAlertsConfig> = {}) {
  const audioConfig = { ...DEFAULT_CONFIG, ...config }
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({})
  const lastPlayTime = useRef<{ [key: string]: number }>({})

  // Inicializar áudios
  useEffect(() => {
    if (typeof window === 'undefined') return

    const sounds = {
      patternDetected: audioConfig.patternDetectedSound,
      betPlaced: audioConfig.betPlacedSound,
      win: audioConfig.winSound,
      loss: audioConfig.lossSound
    }

    Object.entries(sounds).forEach(([key, src]) => {
      if (!audioRefs.current[key]) {
        const audio = new Audio(src)
        audio.volume = audioConfig.volume
        audio.preload = 'auto'
        
        // Fallback para sons sintéticos se arquivo não existir
        audio.onerror = () => {
          console.log(`🔊 Arquivo de som não encontrado: ${src}, usando som sintético`)
        }
        
        audioRefs.current[key] = audio
      }
    })

    return () => {
      // Cleanup
      Object.values(audioRefs.current).forEach(audio => {
        audio.pause()
        audio.currentTime = 0
      })
    }
  }, [audioConfig.patternDetectedSound, audioConfig.betPlacedSound, audioConfig.winSound, audioConfig.lossSound, audioConfig.volume])

  // Função para tocar som com throttling
  const playSound = useCallback((soundType: keyof typeof audioRefs.current, force = false) => {
    if (!audioConfig.enabled) return

    const now = Date.now()
    const lastPlay = lastPlayTime.current[soundType] || 0
    const minInterval = 1000 // Mínimo 1 segundo entre sons do mesmo tipo

    if (!force && (now - lastPlay) < minInterval) {
      console.log(`🔊 Som ${soundType} ignorado (throttling)`)
      return
    }

    const audio = audioRefs.current[soundType]
    if (audio) {
      audio.currentTime = 0
      audio.volume = audioConfig.volume
      
      audio.play().catch(error => {
        console.log(`🔊 Erro ao tocar som ${soundType}:`, error)
        // Fallback para som sintético
        playBeepSound(soundType as string)
      })
      
      lastPlayTime.current[soundType] = now
      console.log(`🔊 Som tocado: ${soundType}`)
    } else {
      // Fallback para som sintético
      playBeepSound(soundType as string)
    }
  }, [audioConfig.enabled, audioConfig.volume])

  // Função para sons sintéticos (fallback)
  const playBeepSound = useCallback((soundType: string) => {
    if (typeof window === 'undefined' || !audioConfig.enabled) return

    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      // Diferentes frequências para diferentes tipos de som
      const frequencies: { [key: string]: number } = {
        patternDetected: 800, // Tom agudo para padrão detectado
        betPlaced: 600,       // Tom médio para aposta
        win: 1000,           // Tom alto para vitória
        loss: 300            // Tom baixo para derrota
      }

      oscillator.frequency.setValueAtTime(frequencies[soundType] || 500, audioContext.currentTime)
      oscillator.type = 'sine'

      gainNode.gain.setValueAtTime(audioConfig.volume * 0.3, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3)

      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.3)

      console.log(`🔊 Som sintético tocado: ${soundType} (${frequencies[soundType]}Hz)`)
    } catch (error) {
      console.log('🔊 Erro ao criar som sintético:', error)
    }
  }, [audioConfig.enabled, audioConfig.volume])

  // Funções específicas para cada tipo de alerta
  const playPatternDetected = useCallback((patternsCount: number = 1) => {
    console.log(`🎯 [AUDIO] Padrão detectado! (${patternsCount} padrões)`)
    
    // Som mais intenso para múltiplos padrões
    if (patternsCount > 1) {
      playSound('patternDetected', true)
      setTimeout(() => playSound('patternDetected', true), 200)
    } else {
      playSound('patternDetected')
    }
  }, [playSound])

  const playBetPlaced = useCallback((amount: number, betType: string) => {
    console.log(`💰 [AUDIO] Aposta realizada! R$ ${amount.toFixed(2)} em ${betType}`)
    playSound('betPlaced')
  }, [playSound])

  const playWin = useCallback((profit: number) => {
    console.log(`🎉 [AUDIO] Vitória! Lucro: R$ ${profit.toFixed(2)}`)
    playSound('win')
  }, [playSound])

  const playLoss = useCallback((loss: number) => {
    console.log(`❌ [AUDIO] Derrota! Perda: R$ ${loss.toFixed(2)}`)
    playSound('loss')
  }, [playSound])

  // Função para testar sons
  const testSounds = useCallback(() => {
    console.log('🔊 Testando todos os sons...')
    playSound('patternDetected', true)
    setTimeout(() => playSound('betPlaced', true), 1000)
    setTimeout(() => playSound('win', true), 2000)
    setTimeout(() => playSound('loss', true), 3000)
  }, [playSound])

  // Função para atualizar configurações
  const updateConfig = useCallback((newConfig: Partial<AudioAlertsConfig>) => {
    Object.assign(audioConfig, newConfig)
    
    // Atualizar volume dos áudios existentes
    Object.values(audioRefs.current).forEach(audio => {
      audio.volume = audioConfig.volume
    })
  }, [audioConfig])

  return {
    // Funções principais
    playPatternDetected,
    playBetPlaced,
    playWin,
    playLoss,
    
    // Utilitários
    testSounds,
    updateConfig,
    
    // Estado
    config: audioConfig,
    isEnabled: audioConfig.enabled
  }
} 