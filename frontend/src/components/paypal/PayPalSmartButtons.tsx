"use client";

import React, { useEffect, useRef, useState } from "react";
import { apiClient } from "@/services/api";

declare global {
  interface Window {
    paypal?: any;
  }
}

interface PayPalSmartButtonsProps {
  contractId: string;
  currency?: string;
  onAuthorized: (result: {
    orderId?: string | null;
    authorizationId: string;
    amount: number;
    currency: string;
  }) => void;
  onError: (msg: string) => void;
}

export const PayPalSmartButtons: React.FC<PayPalSmartButtonsProps> = ({
  contractId,
  currency = "USD",
  onAuthorized,
  onError,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const onAuthorizedRef = useRef(onAuthorized);
  const onErrorRef = useRef(onError);
  onAuthorizedRef.current = onAuthorized;
  onErrorRef.current = onError;

  const [sdkReady, setSdkReady] = useState(false);
  const [statusMsg, setStatusMsg] = useState("Loading PayPal Checkout...");

  // Lock PayPal SDK checkout currency to USD
  const paypalCurrency = "USD";

  useEffect(() => {
    let cancelled = false;
    let buttonsInstance: any = null;

    async function loadSdkAndRender() {
      try {
        const cfg = await apiClient.getPayPalConfig();
        if (!cfg.configured || !cfg.clientId || cfg.mode === "mock") {
          if (!cancelled) setStatusMsg("");
          return;
        }

        const sdkIntent = (cfg.intent || "CAPTURE").toLowerCase() === "capture" ? "capture" : "authorize";
        const scriptId = `paypal-sdk-${cfg.clientId}-${paypalCurrency}-${sdkIntent}`;
        const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;

        const renderButtons = () => {
          if (cancelled || !window.paypal || !containerRef.current || !containerRef.current.isConnected) {
            return;
          }
          containerRef.current.innerHTML = "";
          setSdkReady(true);

          const instance = window.paypal.Buttons({
            style: {
              layout: "vertical",
              color: "blue",
              shape: "pill",
              label: "pay",
              height: 44,
            },
            createOrder: async () => {
              const order = await apiClient.createPayPalEscrowOrder(contractId, {});
              return order.orderId;
            },
            onApprove: async (data: { orderID: string }) => {
              setStatusMsg("Authorizing & locking escrow funds...");
              const authRes = await apiClient.authorizePayPalEscrow(contractId, {
                orderId: data.orderID,
              });
              onAuthorizedRef.current({
                orderId: authRes.orderId || data.orderID,
                authorizationId: authRes.authorizationId,
                amount: authRes.heldInEscrowAmount,
                currency: authRes.currency,
              });
            },
            onCancel: () => {
              if (!cancelled) {
                setStatusMsg("");
                onErrorRef.current("PayPal checkout was cancelled.");
              }
            },
            onError: (err: any) => {
              const msg = String(err?.message || err || "");
              if (cancelled || msg.toLowerCase().includes("zoid destroyed")) return;
              setStatusMsg("");
              onErrorRef.current(msg || "PayPal checkout encountered an error.");
            },
          });

          buttonsInstance = instance;
          instance
            .render(containerRef.current)
            .then(() => {
              if (!cancelled) setStatusMsg("");
            })
            .catch((err: any) => {
              const msg = String(err?.message || err || "");
              if (cancelled || msg.toLowerCase().includes("zoid destroyed")) return;
              setStatusMsg("");
              onErrorRef.current(msg || "Failed to render PayPal Smart Buttons.");
            });
        };

        if (existingScript) {
          if (window.paypal) {
            renderButtons();
          } else {
            existingScript.addEventListener("load", renderButtons);
          }
          return;
        }

        const script = document.createElement("script");
        script.id = scriptId;
        script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(
          cfg.clientId
        )}&intent=${sdkIntent}&currency=${encodeURIComponent(paypalCurrency)}`;
        script.async = true;
        script.onload = renderButtons;
        script.onerror = () => {
          if (!cancelled) {
            setStatusMsg("");
          }
        };
        document.body.appendChild(script);
      } catch {
        if (!cancelled) setStatusMsg("");
      }
    }

    loadSdkAndRender();

    return () => {
      cancelled = true;
      if (buttonsInstance && typeof buttonsInstance.close === "function") {
        buttonsInstance.close().catch(() => {});
      }
    };
  }, [contractId, paypalCurrency]);

  return (
    <div className="space-y-2">
      {statusMsg && (
        <p className="text-[11px] text-center text-gray-500 animate-pulse">{statusMsg}</p>
      )}
      <div ref={containerRef} className="min-h-[48px] w-full" />
    </div>
  );
};
