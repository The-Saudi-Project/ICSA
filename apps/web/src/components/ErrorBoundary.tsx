import { Component, type ReactNode } from 'react'
import { Card } from './ui/Card.js'
import { Button } from './ui/Button.js'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh bg-ground flex items-center justify-center p-6">
          <Card className="max-w-md w-full p-8 text-center bg-surface border border-status-danger/20">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-h3 font-bold text-ink mb-2">Something went wrong</h2>
            <p className="text-ink-soft mb-6 text-sm">
              An unexpected error occurred. Please refresh the page or contact support.
            </p>
            <div className="bg-ground p-4 rounded-xl text-left text-xs text-status-danger overflow-auto mb-6">
              <code>{this.state.error?.message || 'Unknown error'}</code>
            </div>
            <Button variant="primary" onClick={() => window.location.reload()} className="w-full">
              Refresh Page
            </Button>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}
