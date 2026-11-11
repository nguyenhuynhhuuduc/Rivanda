import { inputCls } from "@/components/ui/kit";

export function PasswordInput({ name, label, autoComplete }: { name: string; label: string; autoComplete: "current-password" | "new-password" }) {
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-sm font-medium">{label}</label>
      <input id={name} name={name} type="password" required minLength={name === "current" ? undefined : 8} maxLength={128} autoComplete={autoComplete} className={inputCls} />
    </div>
  );
}
