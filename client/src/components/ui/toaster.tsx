import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import * as ToastPrimitives from "@radix-ui/react-toast"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="flex flex-col items-center text-center space-y-2">
              {title && <ToastTitle className="text-xl font-bold">{title}</ToastTitle>}
              {description && (
                <ToastDescription className="text-slate-400 leading-relaxed text-sm">
                  {description}
                </ToastDescription>
              )}
            </div>
            <div className="flex justify-center mt-4 w-full">
              {action || (
                <ToastPrimitives.Close className={`w-full h-11 ${props.variant === 'destructive' ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary/90'} text-white font-bold rounded-xl transition-all shadow-[0_0_15px_rgba(147,51,234,0.3)] outline-none border-none`}>
                  OK, I Understand
                </ToastPrimitives.Close>
              )}
            </div>
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
