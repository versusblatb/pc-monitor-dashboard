import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface PerformanceErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class PerformanceErrorBoundary extends Component<
  PerformanceErrorBoundaryProps,
  State
> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div role="alert" className="perf-error-boundary">
            <p>Dashboard encountered an error.</p>
            <button type="button" onClick={() => this.setState({ hasError: false, error: null })}>
              Retry
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
