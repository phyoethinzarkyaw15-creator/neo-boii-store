import React from 'react';
import { NEO_EMPIRE_LOGO_SRC, handleLogoImageError } from '../utils/brandAssets';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    console.error('Application runtime error caught by ErrorBoundary:', error);
  }

  handleRefresh = (): void => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div
          data-testid="error-boundary-screen"
          className="min-h-screen bg-[#08080A] text-[#F4F2ED] flex items-center justify-center p-6"
        >
          <div className="max-w-md w-full rounded-xl p-8 neo-surface-card text-center space-y-5">
            <img
              src={NEO_EMPIRE_LOGO_SRC}
              alt="Neo Empire Logo"
              width={48}
              height={48}
              onError={handleLogoImageError}
              className="w-12 h-12 aspect-square object-contain rounded-lg border border-[#C5A059]/45 mx-auto shadow-[0_6px_20px_rgba(0,0,0,0.7)]"
              style={{
                width: '48px',
                height: '48px',
                maxWidth: '48px',
                maxHeight: '48px',
                objectFit: 'contain',
                margin: '0 auto',
              }}
            />
            <div className="font-display text-xl font-bold tracking-[0.16em] uppercase gold-embossed-heading">
              NEO EMPIRE
            </div>
            <div className="space-y-2">
              <h1 className="font-display text-lg font-semibold text-[#F4F2ED]">
                Something went wrong.
              </h1>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Please refresh the page and try again.
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={this.handleRefresh}
                className="gold-metallic-button px-6 py-3 rounded-lg text-xs font-bold tracking-[0.14em] uppercase cursor-pointer"
              >
                REFRESH
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
