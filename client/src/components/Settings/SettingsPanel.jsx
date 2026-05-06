import { useState } from 'react';
import { X, Smartphone } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import StageControls   from '../Controls/StageControls';
import OutputControls  from '../Controls/OutputControls';
import VirtualControls from '../Controls/VirtualControls';

export default function SettingsPanel({ mobileUrl, onClose }) {
  const [showQR, setShowQR] = useState(false);

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />

      {/* Drawer derecho */}
      <aside className="fixed top-0 right-0 z-50 h-full w-80 bg-surface-800 border-l border-surface-700 flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700 shrink-0">
          <span className="text-sm font-semibold text-white">Configuración</span>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors p-1 rounded hover:bg-surface-700"
          >
            <X size={16} />
          </button>
        </div>

        {/* Contenido scrollable */}
        <div className="flex-1 overflow-y-auto">

          {/* Sección: Móvil */}
          <div className="border-b border-surface-700 px-4 py-3">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Control móvil</p>
            <button
              onClick={() => setShowQR(v => !v)}
              className="flex items-center gap-2 w-full px-3 py-2 bg-surface-700 hover:bg-surface-600 rounded-lg text-sm text-zinc-300 hover:text-white transition-colors"
            >
              <Smartphone size={15} />
              Conectar móvil (QR)
            </button>

            {showQR && (
              <div className="mt-3 text-center">
                {mobileUrl ? (
                  <>
                    <div className="bg-white p-3 rounded-xl inline-block mb-2">
                      <QRCodeSVG value={mobileUrl} size={160} />
                    </div>
                    <p className="text-zinc-300 text-xs font-mono break-all mb-1">{mobileUrl}</p>
                    <p className="text-zinc-500 text-xs leading-relaxed">
                      Conecta tu móvil a la misma red WiFi<br />y escanea el código QR
                    </p>
                  </>
                ) : (
                  <p className="text-zinc-400 text-sm py-4">Obteniendo IP…</p>
                )}
              </div>
            )}
          </div>

          <OutputControls />
          <StageControls />
          <VirtualControls />
        </div>
      </aside>
    </>
  );
}
