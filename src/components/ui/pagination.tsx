'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  showFirstLast?: boolean
  maxVisiblePages?: number
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  showFirstLast = true,
  maxVisiblePages = 5,
  className,
  size = 'md'
}: PaginationProps) {
  if (totalPages <= 1) return null

  const sizeClasses = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-9 w-9 text-sm',
    lg: 'h-10 w-10 text-base'
  }

  const getVisiblePages = () => {
    const pages: (number | 'ellipsis')[] = []
    
    if (totalPages <= maxVisiblePages) {
      // Se temos poucas páginas, mostra todas
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      // Lógica para páginas com ellipsis
      const halfVisible = Math.floor(maxVisiblePages / 2)
      
      if (currentPage <= halfVisible + 1) {
        // Início: 1, 2, 3, 4, 5, ..., last
        for (let i = 1; i <= maxVisiblePages - 1; i++) {
          pages.push(i)
        }
        if (totalPages > maxVisiblePages) {
          pages.push('ellipsis')
          pages.push(totalPages)
        }
      } else if (currentPage >= totalPages - halfVisible) {
        // Final: 1, ..., n-4, n-3, n-2, n-1, n
        pages.push(1)
        if (totalPages > maxVisiblePages) {
          pages.push('ellipsis')
        }
        for (let i = totalPages - (maxVisiblePages - 2); i <= totalPages; i++) {
          pages.push(i)
        }
      } else {
        // Meio: 1, ..., current-1, current, current+1, ..., last
        pages.push(1)
        pages.push('ellipsis')
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i)
        }
        pages.push('ellipsis')
        pages.push(totalPages)
      }
    }
    
    return pages
  }

  const visiblePages = getVisiblePages()

  return (
    <div className={cn('flex items-center justify-center gap-1', className)}>
      {/* Páginas numeradas */}
      {visiblePages.map((page, index) => {
        if (page === 'ellipsis') {
          return (
            <div
              key={`ellipsis-${index}`}
              className={cn(
                'flex items-center justify-center text-gray-500 font-mono',
                sizeClasses[size]
              )}
            >
              <MoreHorizontal className="h-4 w-4" />
            </div>
          )
        }

        const isActive = page === currentPage

        return (
          <Button
            key={page}
            variant={isActive ? "default" : "outline"}
            size="sm"
            onClick={() => onPageChange(page)}
            className={cn(
              'font-mono',
              sizeClasses[size],
              isActive
                ? 'bg-green-500/20 border-green-500/50 text-green-400 hover:bg-green-500/30'
                : 'bg-black/50 border-gray-600/50 text-gray-400 hover:bg-gray-700/50 hover:text-green-400 hover:border-green-500/50'
            )}
          >
            {page}
          </Button>
        )
      })}
    </div>
  )
}

// Componente de informações da paginação
export interface PaginationInfoProps {
  currentPage: number
  totalPages: number
  totalItems: number
  itemsPerPage: number
  className?: string
}

export function PaginationInfo({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  className
}: PaginationInfoProps) {
  const startItem = (currentPage - 1) * itemsPerPage + 1
  const endItem = Math.min(currentPage * itemsPerPage, totalItems)

  return (
    <div className={cn('text-sm text-gray-400 font-mono', className)}>
      Mostrando {startItem}-{endItem} de {totalItems} itens
    </div>
  )
}

// Hook para gerenciar paginação
export function usePagination(totalItems: number, itemsPerPage: number = 10) {
  const [currentPage, setCurrentPage] = useState(1)
  
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  
  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)))
  }
  
  const nextPage = () => goToPage(currentPage + 1)
  const prevPage = () => goToPage(currentPage - 1)
  const firstPage = () => goToPage(1)
  const lastPage = () => goToPage(totalPages)
  
  const getPageItems = <T,>(items: T[]) => {
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return items.slice(startIndex, endIndex)
  }
  
  return {
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    goToPage,
    nextPage,
    prevPage,
    firstPage,
    lastPage,
    getPageItems
  }
}