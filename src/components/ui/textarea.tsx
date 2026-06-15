import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[140px] w-full resize-none rounded-2xl border border-ink/15 bg-white px-4 py-3.5 text-xl font-medium text-ink shadow-sm transition-all",
        "placeholder:font-normal placeholder:text-ink/30",
        "focus-visible:border-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink/10",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
