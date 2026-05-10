import { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[CICTrix] Render error caught by ErrorBoundary:', error, info);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleHardReload = (): void => {
    const url = new URL(window.location.href);
    url.searchParams.set('_cb', Date.now().toString());
    window.location.replace(url.toString());
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          backgroundColor: '#f8fafc',
          color: '#0f172a',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: '560px',
            width: '100%',
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '16px',
            padding: '32px',
            boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
          }}
        >
          <h1 style={{ margin: '0 0 8px', fontSize: '24px', fontWeight: 700 }}>
            Something went wrong loading this page
          </h1>
          <p style={{ margin: '0 0 20px', color: '#475569', lineHeight: 1.5 }}>
            This is often caused by an outdated cached version of the app. Click <strong>Reload (clear cache)</strong> below to fetch the latest version.
          </p>
          <pre
            style={{
              backgroundColor: '#0f172a',
              color: '#e2e8f0',
              padding: '14px',
              borderRadius: '8px',
              overflow: 'auto',
              fontSize: '12px',
              lineHeight: 1.5,
              margin: '0 0 20px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {error.message || String(error)}
          </pre>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={this.handleHardReload}
              style={{
                backgroundColor: '#4f46e5',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 18px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reload (clear cache)
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                backgroundColor: '#ffffff',
                color: '#0f172a',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '10px 18px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
