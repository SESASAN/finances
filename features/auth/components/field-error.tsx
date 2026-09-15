type FieldErrorProps = {
  message?: string;
};

// Client-side (React Hook Form) and server-side (Zod re-parse in the Server Action)
// errors both render through this one component — client error takes priority since it
// is more current (RHF validates on blur, before the form ever reaches the server).
export function FieldError({ message }: FieldErrorProps) {
  if (!message) return null;

  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}
