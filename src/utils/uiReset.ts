type UiResetOptions = {
  dispatchOverlayClose?: boolean;
  delayedPassMs?: number;
};

export const resetTransientUiState = ({ dispatchOverlayClose = true }: UiResetOptions = {}) => {
  if (dispatchOverlayClose && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('cictrix:force-close-overlays'));
  }

  if (typeof document !== 'undefined') {
    document.body.style.overflow = '';
    document.body.style.pointerEvents = '';
    document.documentElement.style.overflow = '';
    document.documentElement.style.pointerEvents = '';
  }
};

export const scheduleTransientUiReset = ({
  dispatchOverlayClose = true,
  delayedPassMs = 120,
}: UiResetOptions = {}) => {
  resetTransientUiState({ dispatchOverlayClose });

  if (typeof window === 'undefined') {
    return () => {}; // No-op on server
  }

  const frame = window.requestAnimationFrame(() => {
    resetTransientUiState({ dispatchOverlayClose: false });
  });

  const timer = window.setTimeout(() => {
    resetTransientUiState({ dispatchOverlayClose: false });
  }, delayedPassMs);

  return () => {
    window.cancelAnimationFrame(frame);
    window.clearTimeout(timer);
  };
};