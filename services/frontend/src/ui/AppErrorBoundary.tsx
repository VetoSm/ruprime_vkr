import React from 'react';
import { trackEvent } from '../utils/telemetry';

type State = {
  hasError: boolean;
};

export default class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    trackEvent('frontend_error_boundary', {
      message: error.message,
      stack: error.stack?.slice(0, 2000),
      componentStack: info.componentStack?.slice(0, 2000),
    });
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="auth-page">
        <div className="auth-card">
          <h2>Что-то пошло не так</h2>
          <p className="text-muted mb-20">
            Произошла неожиданная ошибка интерфейса. Попробуйте перезагрузить страницу.
          </p>
          <div className="flex gap-10">
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              Перезагрузить
            </button>
            <a href="/" className="btn btn-outline">На главную</a>
          </div>
        </div>
      </div>
    );
  }
}
