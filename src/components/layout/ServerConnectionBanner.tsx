import React, { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useServerConfigStore } from "../../stores/serverConfigStore";
import apiClient from "../../api/client";
import { useLockStore } from "../../stores/lockStore";

export const ServerConnectionBanner: React.FC = () => {
  const {
    isServerConnected,
    isReconnecting,
    serverUrl,
    setServerConnected,
    setReconnecting,
  } = useServerConfigStore();
  // W6-05: no background requests behind the lock screen; the poll resumes on unlock.
  const locked = useLockStore((state) => state.locked);

  const handleRetry = async () => {
    setReconnecting(true);
    try {
      // Ping server health or auth check
      await apiClient.get("/operating-units", { timeout: 5000 });
      setServerConnected(true, null);
    } catch {
      setServerConnected(false, "Server ping failed");
    } finally {
      setReconnecting(false);
    }
  };

  useEffect(() => {
    if (isServerConnected || locked) return;

    // Periodically check server connectivity every 10 seconds if disconnected
    const interval = setInterval(() => {
      handleRetry();
    }, 10000);

    return () => clearInterval(interval);
  }, [isServerConnected, locked]);

  if (isServerConnected) {
    return null;
  }

  return (
    <div
      dir="rtl"
      className="bg-amber-600 text-white px-4 py-2.5 shadow-md flex items-center justify-between z-50 animate-fade-in"
    >
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 animate-pulse text-amber-200" />
        <div>
          <span className="font-semibold text-sm">
            تعذر الاتصال بالسيرفر المحلي / جاري إعادة الاتصال...
          </span>
          <span className="text-xs opacity-90 block">
            السيرفر الحالي: <code className="bg-amber-700 px-1 py-0.5 rounded text-amber-100">{serverUrl}</code>
          </span>
        </div>
      </div>

      <button
        onClick={handleRetry}
        disabled={isReconnecting}
        className="flex items-center gap-1.5 bg-amber-700 hover:bg-amber-800 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-all active:scale-95 disabled:opacity-50"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isReconnecting ? "animate-spin" : ""}`} />
        {isReconnecting ? "جاري الفحص..." : "إعادة المحاولة"}
      </button>
    </div>
  );
};
