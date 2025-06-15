'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Volume2, VolumeX, TestTube } from 'lucide-react'
import { useAudioAlerts } from '@/hooks/useAudioAlerts'
import { useState } from 'react'

interface AudioControlsProps {
  className?: string
}

export default function AudioControls({ className }: AudioControlsProps) {
  const audioAlerts = useAudioAlerts()
  const [volume, setVolume] = useState(audioAlerts.config.volume)

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume)
    audioAlerts.updateConfig({ volume: newVolume })
  }

  const handleToggleAudio = () => {
    audioAlerts.updateConfig({ enabled: !audioAlerts.isEnabled })
  }

  const handleTestSounds = () => {
    audioAlerts.testSounds()
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          {audioAlerts.isEnabled ? (
            <Volume2 className="h-5 w-5 text-green-500" />
          ) : (
            <VolumeX className="h-5 w-5 text-red-500" />
          )}
          Alertas Sonoros
        </CardTitle>
        <CardDescription>
          Configure os sons para detecção de padrões e apostas
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Toggle de áudio */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">
            Sons {audioAlerts.isEnabled ? 'Habilitados' : 'Desabilitados'}
          </span>
          <Button
            variant={audioAlerts.isEnabled ? "default" : "outline"}
            size="sm"
            onClick={handleToggleAudio}
          >
            {audioAlerts.isEnabled ? (
              <>
                <Volume2 className="h-4 w-4 mr-2" />
                Ligado
              </>
            ) : (
              <>
                <VolumeX className="h-4 w-4 mr-2" />
                Desligado
              </>
            )}
          </Button>
        </div>

        {/* Controle de volume */}
        {audioAlerts.isEnabled && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Volume</span>
              <span className="text-sm text-muted-foreground">
                {Math.round(volume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
            />
          </div>
        )}

        {/* Botão de teste */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleTestSounds}
          disabled={!audioAlerts.isEnabled}
          className="w-full"
        >
          <TestTube className="h-4 w-4 mr-2" />
          Testar Sons
        </Button>

        {/* Legenda dos sons */}
        {audioAlerts.isEnabled && (
          <div className="text-xs text-muted-foreground space-y-1">
            <div className="font-medium mb-2">Tipos de Som:</div>
            <div>🎯 <strong>Padrão Detectado:</strong> Tom agudo (800Hz)</div>
            <div>💰 <strong>Aposta Realizada:</strong> Tom médio (600Hz)</div>
            <div>🎉 <strong>Vitória:</strong> Tom alto (1000Hz)</div>
            <div>❌ <strong>Derrota:</strong> Tom baixo (300Hz)</div>
          </div>
        )}
      </CardContent>
    </Card>
  )
} 