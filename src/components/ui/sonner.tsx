"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        style: {
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          fontSize: '14px',
          fontWeight: '500',
          letterSpacing: '0.025em',
          border: '1px solid rgba(34, 197, 94, 0.3)',
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          backdropFilter: 'blur(16px)',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 20px rgba(34, 197, 94, 0.2)',
          padding: '16px',
          color: '#4ade80',
          textTransform: 'uppercase' as const,
          minWidth: '300px',
        },
        classNames: {
          toast: 'hacker-toast',
          title: 'text-green-400 font-mono font-medium text-sm',
          description: 'text-gray-400 font-mono text-xs mt-1',
          success: 'border-green-500/30 bg-black/90',
          error: 'border-red-500/30 bg-black/90',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
