// Reemplaza los alert()/confirm() nativos del navegador (feos, bloqueantes,
// sin estilo) por un aviso flotante con los colores de Lexara y un modal de
// confirmación reutilizando el lenguaje visual de los drawers.

export function Toast({ toast, onClose }){
  if(!toast) return null;
  return (
    <div className={"toast toast-" + (toast.type || 'info')} role="status">
      <span className="toast-icon">
        {toast.type === 'error' ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
        )}
      </span>
      <span className="toast-msg">{toast.msg}</span>
      <button type="button" className="toast-close" aria-label="Cerrar aviso" onClick={onClose}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
  );
}

export function ConfirmDialog({ confirmState, onConfirm, onCancel }){
  if(!confirmState) return null;
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-box" onClick={e => e.stopPropagation()} role="alertdialog" aria-modal="true">
        <p>{confirmState.message}</p>
        <div className="confirm-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</button>
          <button type="button" className="btn-primary btn-danger" onClick={onConfirm}>Sí, eliminar</button>
        </div>
      </div>
    </div>
  );
}
