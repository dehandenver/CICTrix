import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Modal } from './Modal';
import { ConfirmModal } from './ConfirmModal';

const Harness = ({ dismissible = true }: { dismissible?: boolean }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create New Job Position"
        subtitle="Fill in the details"
        dismissible={dismissible}
        footer={<><button type="button">Cancel</button><button type="button">Create Position</button></>}
      >
        <input aria-label="Position title" />
      </Modal>
    </>
  );
};

describe('Modal', () => {
  it('renders a labelled dialog with header, body and footer', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('Open'));
    const dialog = screen.getByRole('dialog', { name: 'Create New Job Position' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Fill in the details');
    expect(screen.getByRole('button', { name: 'Create Position' })).toBeInTheDocument();
    expect(dialog.closest('.abyan-ds')).not.toBeNull();
  });

  it('focuses the first field, closes on Esc and returns focus to the opener', () => {
    render(<Harness />);
    const opener = screen.getByText('Open');
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByLabelText('Position title')).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('closes on an overlay click but not a click inside the panel', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('Open'));
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ignores Esc and the overlay when not dismissible', () => {
    render(<Harness dismissible={false} />);
    fireEvent.click(screen.getByText('Open'));
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
  });

  it('focuses the first enabled button when not dismissible and the body has no fields', () => {
    render(
      <Modal open onClose={() => {}} title="Nothing Was Completed" dismissible={false} footer={<button type="button">Done</button>}>
        <p>Rowena Bautista: not hired.</p>
      </Modal>,
    );
    expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus();
  });

  it('focuses the panel itself when nothing inside can take focus', () => {
    render(
      <Modal open onClose={() => {}} title="Saving" dismissible={false}>
        <p>Please wait.</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toHaveFocus();
  });

  it('traps Tab inside the panel', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('Open'));
    const last = screen.getByRole('button', { name: 'Create Position' });
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  it('locks page scroll while open', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('Open'));
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.body.style.overflow).toBe('');
  });
});

describe('ConfirmModal', () => {
  it('starts on Cancel, closes only the top modal on Esc, and keeps the label while loading', () => {
    const onCancel = vi.fn();
    const onOuterClose = vi.fn();
    const { rerender } = render(
      <>
        <Modal open onClose={onOuterClose} title="Archive list"><p>rows</p></Modal>
        <ConfirmModal open title="Permanently delete?" confirmLabel="Permanently Delete" tone="destructive" onConfirm={() => {}} onCancel={onCancel} />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onOuterClose).not.toHaveBeenCalled();

    rerender(
      <>
        <Modal open onClose={onOuterClose} title="Archive list"><p>rows</p></Modal>
        <ConfirmModal open loading title="Permanently delete?" confirmLabel="Permanently Delete" tone="destructive" onConfirm={() => {}} onCancel={onCancel} />
      </>,
    );
    const confirm = screen.getByRole('button', { name: 'Permanently Delete' });
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAttribute('aria-busy', 'true');
    expect(confirm.className).toContain('btn-destructive');
  });
});
