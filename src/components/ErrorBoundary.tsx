import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  message: string | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { message: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { message: error.message }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack)
  }

  render() {
    if (this.state.message) {
      return (
        <div className="app">
          <main className="crash">
            <p className="kicker">Something interrupted the monitor</p>
            <h1>Reload to start again.</h1>
            <p>{this.state.message}</p>
            <button className="button" type="button" onClick={() => window.location.reload()}>
              Reload
            </button>
          </main>
        </div>
      )
    }
    return this.props.children
  }
}
