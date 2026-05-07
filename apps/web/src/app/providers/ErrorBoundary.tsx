import { Component, type ErrorInfo, type ReactNode } from 'react';
import { FullscreenState } from '../../shared/ui/FullscreenState.js';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false
  };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <FullscreenState
          title="Что-то пошло не так"
          description="Обновите экран и попробуйте снова"
          actionLabel="Обновить"
          onAction={() => window.location.reload()}
        />
      );
    }

    return this.props.children;
  }
}
