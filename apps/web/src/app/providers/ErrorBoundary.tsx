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

  private retry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <FullscreenState
          title="Что-то пошло не так"
          description="Мы сохранили приложение открытым. Вернитесь назад или попробуйте повторить действие."
          actionLabel="Попробовать снова"
          onAction={this.retry}
        />
      );
    }

    return this.props.children;
  }
}
