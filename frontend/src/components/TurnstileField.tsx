import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";

export type TurnstileFieldHandle = {
  reset: () => void;
};

type TurnstileFieldProps = {
  onTokenChange: (token: string | null) => void;
};

export const TurnstileField = forwardRef<TurnstileFieldHandle, TurnstileFieldProps>(
  function TurnstileField({ onTokenChange }, ref) {
    const widgetRef = useRef<TurnstileInstance | null>(null);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

    useImperativeHandle(ref, () => ({
      reset: () => {
        widgetRef.current?.reset();
        onTokenChange(null);
      },
    }));

    if (!siteKey) {
      // Local/dev without VITE_TURNSTILE_SITE_KEY: skip widget (backend skips verify if secret empty).
      return null;
    }

    return (
      <div className="space-y-2">
        <Turnstile
          ref={widgetRef}
          siteKey={siteKey}
          options={{ theme: "light", size: "flexible" }}
          onWidgetLoad={() => setStatus("ready")}
          onSuccess={(token) => {
            setStatus("ready");
            onTokenChange(token);
          }}
          onError={() => {
            setStatus("error");
            onTokenChange(null);
          }}
          onExpire={() => {
            onTokenChange(null);
            widgetRef.current?.reset();
          }}
        />
        {status === "loading" && (
          <p className="text-xs text-black/45">Cargando verificación…</p>
        )}
        {status === "error" && (
          <p className="text-xs text-red-700">No se pudo cargar el captcha. Recarga la página.</p>
        )}
      </div>
    );
  },
);
