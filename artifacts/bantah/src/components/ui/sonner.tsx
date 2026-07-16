import { Toaster as Sonner } from "sonner"
import { useIsMobile } from "@/hooks/use-mobile"
import { useTheme } from "@/lib/theme-provider"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme()
  const isMobile = useIsMobile()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster app-toaster group"
      position={isMobile ? "bottom-center" : "bottom-right"}
      mobileOffset={{ bottom: "calc(5.2rem + env(safe-area-inset-bottom))", left: 12, right: 12 }}
      offset={isMobile ? { bottom: "calc(5.2rem + env(safe-area-inset-bottom))" } : 16}
      gap={8}
      visibleToasts={isMobile ? 2 : 3}
      swipeDirections={isMobile ? ["left", "right", "bottom"] : ["right"]}
      toastOptions={{
        classNames: {
          toast:
            "group toast app-toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg font-mono text-sm",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
