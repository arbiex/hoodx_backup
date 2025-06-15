'use client'

import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, AlertTriangle, CheckCircle, Info, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  description?: string
  children?: React.ReactNode
  type?: 'default' | 'success' | 'error' | 'warning' | 'info'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showCloseButton?: boolean
  closeOnOverlayClick?: boolean
  footer?: React.ReactNode
  actions?: {
    primary?: {
      label: string
      onClick: () => void
      loading?: boolean
      disabled?: boolean
    }
    secondary?: {
      label: string
      onClick: () => void
      disabled?: boolean
    }
  }
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  type = 'default',
  size = 'md',
  showCloseButton = true,
  closeOnOverlayClick = true,
  footer,
  actions
}) => {
  const [isVisible, setIsVisible] = useState(false)
  const [portalContainer, setPortalContainer] = useState<Element | null>(null)

  useEffect(() => {
    // Set up portal container
    setPortalContainer(document.body)
  }, [])

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true)
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
      const timer = setTimeout(() => setIsVisible(false), 150)
      return () => clearTimeout(timer)
    }

    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  // Handle Escape key press
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen && closeOnOverlayClick) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscapeKey)
      return () => document.removeEventListener('keydown', handleEscapeKey)
    }
  }, [isOpen, closeOnOverlayClick, onClose])

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose()
    }
  }

  const handleBackdropClick = () => {
    if (closeOnOverlayClick) {
      onClose()
    }
  }

  const getSizeClasses = () => {
    switch (size) {
      case 'sm': return 'max-w-md'
      case 'md': return 'max-w-lg'
      case 'lg': return 'max-w-2xl'
      case 'xl': return 'max-w-4xl'
      default: return 'max-w-lg'
    }
  }

  const getTypeIcon = () => {
    switch (type) {
      case 'success': return <CheckCircle className="h-6 w-6 text-green-400" />
      case 'error': return <AlertCircle className="h-6 w-6 text-red-400" />
      case 'warning': return <AlertTriangle className="h-6 w-6 text-yellow-400" />
      case 'info': return <Info className="h-6 w-6 text-blue-400" />
      default: return null
    }
  }

  const getTypeBorderColor = () => {
    switch (type) {
      case 'success': return 'border-green-500/30'
      case 'error': return 'border-red-500/30'
      case 'warning': return 'border-yellow-500/30'
      case 'info': return 'border-blue-500/30'
      default: return 'border-green-500/30'
    }
  }

  const getTypeShadowColor = () => {
    switch (type) {
      case 'success': return 'shadow-green-500/20'
      case 'error': return 'shadow-red-500/20'
      case 'warning': return 'shadow-yellow-500/20'
      case 'info': return 'shadow-blue-500/20'
      default: return 'shadow-green-500/20'
    }
  }

  if (!isVisible || !portalContainer) return null

  const modalContent = (
    <div 
      className={`
        fixed inset-0 z-[99999] flex items-center justify-center p-4 transition-all duration-300
        ${isOpen ? 'opacity-100' : 'opacity-0'}
      `}
      onClick={handleOverlayClick}
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer" 
        onClick={handleBackdropClick}
      />
      
      {/* Modal */}
      <div 
        className={`
          relative w-full ${getSizeClasses()} transform transition-all duration-300
          ${isOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}
        `}
      >
        <div 
          className={`
            backdrop-blur-lg border ${getTypeBorderColor()} rounded-2xl shadow-2xl ${getTypeShadowColor()}
            animate-in fade-in-0 zoom-in-95 duration-300
          `}
          style={{ backgroundColor: '#131619' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          {(title || showCloseButton) && (
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <div className="flex items-center gap-3">
                {getTypeIcon()}
                <div>
                  {title && (
                    <h2 className="text-lg font-semibold text-green-400 font-mono">
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p className="text-sm text-gray-400 font-mono mt-1">
                      // {description}
                    </p>
                  )}
                </div>
              </div>
              
              {showCloseButton && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="h-8 w-8 p-0 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}

          {/* Content */}
          <div className="p-6">
            {children}
          </div>

          {/* Footer */}
          {(footer || actions) && (
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-800">
              {footer || (
                <>
                  {actions?.secondary && (
                    <Button
                      variant="ghost"
                      onClick={actions.secondary.onClick}
                      disabled={actions.secondary.disabled}
                      className="text-gray-400 hover:text-white border border-gray-600 hover:border-gray-500 font-mono"
                    >
                      {actions.secondary.label}
                    </Button>
                  )}
                  
                  {actions?.primary && (
                    <Button
                      onClick={actions.primary.onClick}
                      disabled={actions.primary.disabled || actions.primary.loading}
                      className={`
                        font-mono transition-all duration-200
                        ${type === 'error' 
                          ? 'bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30' 
                          : type === 'warning'
                          ? 'bg-yellow-500/20 border border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/30'
                          : type === 'info'
                          ? 'bg-blue-500/20 border border-blue-500/50 text-blue-400 hover:bg-blue-500/30'
                          : 'bg-green-500/20 border border-green-500/50 text-green-400 hover:bg-green-500/30'
                        }
                      `}
                    >
                      {actions.primary.loading ? 'PROCESSING...' : actions.primary.label}
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, portalContainer)
}

// Hook para facilitar o uso do modal
export const useModal = () => {
  const [isOpen, setIsOpen] = useState(false)
  
  const openModal = () => setIsOpen(true)
  const closeModal = () => setIsOpen(false)
  
  return {
    isOpen,
    openModal,
    closeModal
  }
}

export default Modal 