import { Bell, CheckCircle2, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../services/api";

export function TelegramLink() {
  const [connected, setConnected] = useState(false);
  const [botUsername, setBotUsername] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getTelegramStatus()
      .then((status) => {
        setConnected(status.connected);
        setBotUsername(status.bot_username);
      })
      .catch(() => setError("No se pudo comprobar el estado de Telegram."));
  }, []);

  async function generateLink() {
    try {
      const result = await api.generateTelegramLink();
      setLink(result.link);
    } catch {
      setError("No se pudo generar el enlace.");
    }
  }

  return (
    <div className="rounded-sm border border-black/10 bg-white p-8 shadow-sm">
      <div className="flex items-start gap-4">
        <span className="rounded-sm border border-cyan-100 bg-cyan-50 p-3 text-cyan-700">
          <Bell size={20} />
        </span>
        <div>
          <h3 className="font-display text-2xl uppercase">Telegram</h3>
          <p className="mt-2 text-sm leading-6 text-black/55">
            Recibe avisos instantáneos cuando tengas una nueva cita o una cancelación.
          </p>
        </div>
      </div>

      {connected ? (
        <div className="mt-6 flex items-center gap-3 rounded-sm border border-green-200 bg-green-50 px-4 py-4 text-sm text-green-800">
          <CheckCircle2 size={18} />
          Telegram conectado — @{botUsername}
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <button
            onClick={generateLink}
            className="inline-flex items-center gap-2 bg-ink px-5 py-3 text-xs uppercase tracking-[0.14em] text-paper"
          >
            <ExternalLink size={14} />
            Generar enlace de vinculación
          </button>
          {link && (
            <div className="rounded-sm border border-black/10 bg-[#eceae4]/60 p-4">
              <p className="text-[10px] uppercase tracking-[0.16em] text-black/45">Enlace válido 1 hora</p>
              <a href={link} target="_blank" rel="noreferrer" className="mt-2 block break-all text-sm text-accent underline">
                {link}
              </a>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
    </div>
  );
}
