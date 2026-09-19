import * as React from "react";
import { cn } from "@/lib/utils";

const Separator = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div className={cn("ui-separator", className)} ref={ref} role="separator" {...props} />
  ),
);

Separator.displayName = "Separator";

export { Separator };
