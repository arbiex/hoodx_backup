'use client'

import { useState, ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

interface CollapsibleSectionProps {
  title: string
  icon?: ReactNode
  children: ReactNode
  defaultExpanded?: boolean
  className?: string
  titleClassName?: string
  contentClassName?: string
  iconColor?: string
  borderColor?: string
}

export default function CollapsibleSection({
  title,
  icon,
  children,
  defaultExpanded = false,
  className = "p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg",
  titleClassName = "text-sm font-semibold text-blue-400 font-mono",
  contentClassName = "text-xs text-gray-300 font-mono space-y-1",
  iconColor = "text-blue-400",
  borderColor = "border-blue-500/20"
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  return (
    <div className={className}>
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full group"
      >
        <div className="flex items-center gap-2">
          {icon && <div className={`flex-shrink-0 w-4 h-4 flex items-center justify-center ${iconColor}`}>{icon}</div>}
          <span className={titleClassName}>{title}</span>
        </div>
        <ChevronDown 
          className={`h-4 w-4 ${iconColor} transition-transform duration-500 ease-in-out ${
            isExpanded ? 'rotate-180' : ''
          }`} 
        />
      </button>
      
      <div className={`overflow-hidden transition-all duration-500 ease-in-out ${
        isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
      }`}>
        <div className={`mt-2 pt-2 border-t ${borderColor}`}>
          <div className={contentClassName}>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
} 