type UiResetOptions = {
  dispatchOverlayClose?: boolean;
  delayedPassMs?: number;
};

export const resetTransientUiState = ({ dispatchOverlayClose = true }: UiResetOptions = {}) => {
  if (dispatchOverlayClose) {
    window.dispatchEvent(new Event('cictrix:force-close-overlays'));
  }

  document.body.style.overflow = '';
  document.body.style.pointerEvents = '';
  document.documentElement.style.overflow = '';
  document.documentElement.style.pointerEvents = '';
};

export const scheduleTransientUiReset = ({
  dispatchOverlayClose = true,
  delayedPassMs = 120,
}: UiResetOptions = {}) => {
  resetTransientUiState({ dispatchOverlayClose });

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