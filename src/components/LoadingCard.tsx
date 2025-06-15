import { Card, CardContent, CardHeader } from '@/components/ui/card'

interface LoadingCardProps {
  title?: string
  className?: string
}

export default function LoadingCard({ title = "LOADING...", className = "border-green-500/30 backdrop-blur-sm" }: LoadingCardProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-green-400/50 rounded animate-pulse"></div>
          <div className="h-5 bg-green-400/50 rounded w-32 animate-pulse"></div>
        </div>
        <div className="h-3 bg-gray-400/30 rounded w-48 animate-pulse mt-2"></div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="h-8 bg-green-400/30 rounded w-24 animate-pulse"></div>
          <div className="h-4 bg-gray-400/20 rounded w-36 animate-pulse"></div>
        </div>
      </CardContent>
    </Card>
  )
} 