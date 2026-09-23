interface AlertToastProps {
  message: string
  onDismiss: () => void
}

export function AlertToast({ message, onDismiss }: AlertToastProps) {
  return (
    <div className="toast" role="status">
      <p>{message}</p>
      <button className="text-button" type="button" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  )
}
