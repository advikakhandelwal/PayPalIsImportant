"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { AllCommunityModule, ModuleRegistry, ColDef, themeQuartz } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import {
  Table2,
  Download,
  RefreshCw,
  Zap,
  Send,
  CheckCircle2,
  FileJson,
  ShieldCheck,
} from "lucide-react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { apiClient } from "@/services/api";
import { formatCurrency } from "@/lib/utils";

ModuleRegistry.registerModules([AllCommunityModule]);

export default function LedgerAndIntegrationsPage() {
  const gridRef = useRef<AgGridReact<any>>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Zapier Webhook State
  const [zapierUrl, setZapierUrl] = useState("");
  const [zapierDeliveries, setZapierDeliveries] = useState<any[]>([]);
  const [zapierMsg, setZapierMsg] = useState("");
  const [zapierErr, setZapierErr] = useState("");
  const [isSavingZapier, setIsSavingZapier] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [ledgerData, zapData] = await Promise.all([
        apiClient.getGlobalPayPalLedger().catch(() => []),
        apiClient.getZapierStatus().catch(() => ({ configured: false, webhookUrl: "", deliveries: [] })),
      ]);
      setRows(Array.isArray(ledgerData) ? ledgerData : []);
      setZapierUrl(zapData.webhookUrl || "");
      setZapierDeliveries(Array.isArray(zapData.deliveries) ? zapData.deliveries : []);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveZapier = async (sendTest: boolean) => {
    setIsSavingZapier(true);
    setZapierErr("");
    setZapierMsg("");
    try {
      const res = await apiClient.updateZapierWebhook(zapierUrl.trim(), sendTest);
      setZapierDeliveries(res.deliveries || []);
      setZapierMsg(
        sendTest
          ? `Zapier event dispatched (${res.testDelivery?.status || "QUEUED"})!`
          : "Zapier webhook URL saved!"
      );
      setTimeout(() => setZapierMsg(""), 4000);
    } catch (err: any) {
      setZapierErr(err?.message || "Failed to save Zapier webhook URL.");
    } finally {
      setIsSavingZapier(false);
    }
  };

  const handleExportCsv = () => {
    gridRef.current?.api?.exportDataAsCsv({
      fileName: "trustpay-paypal-escrow-ledger.csv",
    });
  };

  const colDefs: ColDef[] = [
    { field: "id", headerName: "Tx #", width: 85, sortable: true, filter: true },
    { field: "contractId", headerName: "Contract", width: 105, sortable: true, filter: true },
    { field: "operation", headerName: "Operation", width: 170, sortable: true, filter: true },
    {
      field: "status",
      headerName: "Status",
      width: 130,
      sortable: true,
      filter: true,
      cellRenderer: (p: any) => (
        <span
          className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
            p.value === "COMPLETED"
              ? "bg-emerald-100 text-emerald-800"
              : p.value === "FAILED"
              ? "bg-rose-100 text-rose-800"
              : "bg-amber-100 text-amber-800"
          }`}
        >
          {p.value}
        </span>
      ),
    },
    {
      field: "amount",
      headerName: "Amount",
      width: 130,
      sortable: true,
      valueFormatter: (p: any) => formatCurrency(Number(p.value || 0), p.data?.currency || "USD"),
    },
    { field: "mode", headerName: "Mode", width: 105, sortable: true, filter: true },
    {
      headerName: "PayPal Reference ID",
      flex: 1,
      minWidth: 220,
      valueGetter: (p: any) =>
        p.data?.paypalPayoutBatchId ||
        p.data?.paypalCaptureId ||
        p.data?.paypalAuthId ||
        p.data?.paypalOrderId ||
        p.data?.paypalRefundId ||
        "—",
    },
    {
      field: "createdAt",
      headerName: "Timestamp",
      width: 190,
      sortable: true,
      valueFormatter: (p: any) => (p.value ? new Date(p.value).toLocaleString() : "—"),
    },
  ];

  return (
    <RequireAuth>
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-white border border-gray-100 shadow-xs">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#1E1820] text-white flex items-center justify-center shadow-xs">
              <Table2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-[#1E1820]">
                Escrow Audit Ledger &amp; Automations
              </h1>
              <p className="text-xs text-gray-500">
                Real-time PayPal Orders v2 &amp; Payouts ledger powered by AG Grid, Zapier Webhooks, and Postman API export.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={apiClient.getPostmanCollectionUrl()}
              download="TrustPay_AI_PayPal_Escrow.postman_collection.json"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200"
            >
              <FileJson className="w-3.5 h-3.5" />
              Export Postman Collection
            </a>
            <Button variant="outline" size="sm" onClick={handleExportCsv}>
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export CSV
            </Button>
            <Button variant="primary" size="sm" onClick={loadData}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* AG Grid Financial Ledger */}
        <Card className="p-5 rounded-3xl border border-gray-200 bg-white space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#0EA5B7]" />
              <h2 className="text-sm font-extrabold text-[#1E1820]">
                PayPal Escrow &amp; Payout Audit Grid ({rows.length} transactions)
              </h2>
            </div>
            <Badge variant="paypal" size="sm">AG Grid Powered</Badge>
          </div>

          <div className="w-full h-[420px]">
            <AgGridReact
              ref={gridRef}
              theme={themeQuartz}
              rowData={rows}
              columnDefs={colDefs}
              pagination={true}
              paginationPageSize={12}
              defaultColDef={{ resizable: true }}
            />
          </div>
        </Card>

        {/* Zapier Webhook Automation Card */}
        <Card className="p-6 rounded-3xl border border-gray-200 bg-white space-y-4 shadow-xs">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-orange-500 text-white flex items-center justify-center">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-extrabold text-gray-900">
                  Zapier Real-Time Webhook Automations
                </h2>
                <p className="text-xs text-gray-500">
                  Automatically trigger Slack alerts, Google Sheets rows, or emails on{" "}
                  <code>escrow.funded</code> &amp; <code>milestone.paid</code> events.
                </p>
              </div>
            </div>
            <Badge variant="warning" size="sm">Zapier Integration</Badge>
          </div>

          {zapierMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{zapierMsg}</span>
            </div>
          )}
          {zapierErr && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
              {zapierErr}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="url"
              value={zapierUrl}
              onChange={(e) => setZapierUrl(e.target.value)}
              placeholder="https://hooks.zapier.com/hooks/catch/..."
              className="flex-1 h-10 px-3.5 rounded-xl border border-gray-200 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#51E2F5]"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={isSavingZapier}
              onClick={() => handleSaveZapier(false)}
            >
              Save Hook URL
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={isSavingZapier}
              onClick={() => handleSaveZapier(true)}
            >
              <Send className="w-3.5 h-3.5 mr-1.5" />
              Send Test Event
            </Button>
          </div>

          {zapierDeliveries.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">
                Recent Webhook Events
              </span>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {zapierDeliveries.map((d, idx) => (
                  <div
                    key={idx}
                    className="flex flex-wrap items-center justify-between gap-2 text-[11px] bg-slate-50 px-3 py-2 rounded-xl border border-slate-200"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          d.status === "DELIVERED"
                            ? "bg-emerald-100 text-emerald-800"
                            : d.status === "READY_NO_WEBHOOK"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {d.status}
                      </span>
                      <span className="font-mono font-bold text-slate-800">{d.event}</span>
                    </div>
                    <span className="text-slate-500">
                      {d.timestamp ? new Date(d.timestamp).toLocaleTimeString() : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </RequireAuth>
  );
}
