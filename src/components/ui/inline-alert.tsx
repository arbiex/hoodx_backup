'use client'

import React from 'react'
import { AlertCircle, CheckCircle, AlertTriangle, Info, X } from 'lucide-react'

interface InlineAlertProps {
  type?: 'success' | 'error' | 'warning' | 'info'
  message: string
  onClose?: () => void
  className?: string
}

const InlineAlert: React.FC<InlineAlertProps> = ({
  type = 'info',
  message,
  onClose,
  className = ''
}) => {
  const getTypeStyles = () => {
    switch (type) {
      case 'success':
        return {
          bg: 'bg-green-500/10',
          border: 'border-green-500/30',
          text: 'text-green-400',
          icon: CheckCircle
        }
      case 'error':
        return {
          bg: 'bg-red-500/10',
          border: 'border-red-500/30',
          text: 'text-red-400',
          icon: AlertCircle
        }
      case 'warning':
        return {
          bg: 'bg-yellow-500/10',
          border: 'border-yellow-500/30',
          text: 'text-yellow-400',
          icon: AlertTriangle
        }
      case 'info':
        return {
          bg: 'bg-blue-500/10',
          border: 'border-blue-500/30',
          text: 'text-blue-400',
          icon: Info
        }
      default:
        return {
          bg: 'bg-gray-500/10',
          border: 'border-gray-500/30',
          text: 'text-gray-400',
          icon: Info
        }
    }
  }

  const styles = getTypeStyles()
  const IconComponent = styles.icon

  return (
    <div className={`
      flex items-start gap-3 p-3 rounded-lg border backdrop-blur-sm
      ${styles.bg} ${styles.border}
      animate-in fade-in-0 slide-in-from-top-1 duration-300
      ${className}
    `}>
      <IconComponent className={`h-4 w-4 ${styles.text} mt-0.5 flex-shrink-0`} />
      
      <div className="flex-1">
        <p className={`text-sm font-mono ${styles.text} leading-relaxed`}>
          {message}
        </p>
      </div>
      
      {onClose && (
        <button
          onClick={onClose}
          className={`${styles.text} hover:opacity-70 transition-opacity flex-shrink-0`}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

export default InlineAlert 