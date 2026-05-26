import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import * as XLSX from "xlsx";
import { 
  QrCode, 
  Upload, 
  Clipboard, 
  FileSpreadsheet, 
  Search, 
  Trash2, 
  Plus, 
  CheckCircle2, 
  Clock, 
  HelpCircle, 
  TrendingUp, 
  AlertCircle, 
  ArrowUpRight, 
  Database,
  RefreshCw,
  Sparkles,
  Layers,
  Check,
  X
} from "lucide-react";
import { ChalanRecord } from "./types";
import CameraScanner from "./components/CameraScanner";
import ChalanVisualizer from "./components/ChalanVisualizer";
import MobileScannerView from "./components/MobileScannerView";
import { Smartphone, Wifi } from "lucide-react";

// Initial sample records to populate empty state professionally
const INITIAL_SAMPLES: ChalanRecord[] = [
  {
    id: "sample-1",
    chalanNo: "T-26-05-90812-706",
    chalanDate: "2026-05-15",
    amount: 14500,
    name: "Kamrul Islam Chowdhury",
    bankName: "Sonali Bank PLC",
    branchName: "Ramna Branch",
    district: "Dhaka",
    economicCode: "1-1133-0000-0311",
    verificationStatus: "Verified",
    verificationSource: "Live Government Verification Portal Fetch",
    notes: "Passport service verification. Standard signature validity passed.",
    scannedAt: "2026-05-26T10:30:00Z"
  },
  {
    id: "sample-2",
    chalanNo: "26A092348571",
    chalanDate: "2026-05-20",
    amount: 3200,
    name: "Mst. Farzana Zaman",
    bankName: "Bangladesh Bank",
    branchName: "Local Office",
    district: "Dhaka",
    economicCode: "1-0741-0000-2681",
    verificationStatus: "Verified",
    verificationSource: "AI-Powered OCR Document Verification",
    notes: "Customs duty payment copy verified via barcode matching.",
    scannedAt: "2026-05-26T11:05:00Z"
  }
];

export default function App() {
  // Routing Intercept: render Mobile Scanner View if URL parameter 'session' or 's' is supplied
  const urlParams = new URL(window.location.href);
  const targetSession = urlParams.searchParams.get("session") || urlParams.searchParams.get("s");
  if (targetSession) {
    return <MobileScannerView sessionId={targetSession} />;
  }

  // App state
  const [records, setRecords] = useState<ChalanRecord[]>([]);
  const [activeTab, setActiveTab] = useState<"camera" | "upload" | "paste" | "mobile">("camera");
  const [pastedText, setPastedText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState("");
  const [apiError, setApiError] = useState<string | null>(null);

  // Real-time remote mobile sync states (PC Desktop browser side)
  const [mobileSessionId, setMobileSessionId] = useState<string | null>(null);
  const [mobileStreamStatus, setMobileStreamStatus] = useState<"idle" | "waiting" | "connected" | "received" | "error">("idle");
  const [mobileError, setMobileError] = useState<string | null>(null);
  const [isInitializingMobile, setIsInitializingMobile] = useState(false);

  // Streams & Poll triggers pointers references for clean garbage collection on component unmount
  const esRef = React.useRef<EventSource | null>(null);
  const pollIntervalRef = React.useRef<any | null>(null);

  // Active scanned buffer state before saving
  const [scannedResult, setScannedResult] = useState<Omit<ChalanRecord, "id" | "scannedAt"> | null>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [filterBank, setFilterBank] = useState("All");
  const [filterStatus, setFilterStatus] = useState<"All" | "Verified" | "Verification Pending" | "Invalid/Unverified">("All");

  // Manual input form state
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualForm, setManualForm] = useState({
    chalanNo: "",
    chalanDate: new Date().toISOString().slice(0, 10),
    amount: "",
    name: "",
    bankName: "Sonali Bank PLC",
    branchName: "",
    district: "",
    economicCode: "1-1133-0000-0311",
    verificationStatus: "Verification Pending" as "Verified" | "Verification Pending" | "Invalid/Unverified",
    notes: ""
  });

  // Reusable stream clean teardown
  const cleanupMobileSync = () => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  // Start back-end polling fallback if browser blocks EventSource streaming
  const startPollingSyncFallback = (sId: string) => {
    console.log("[Desktop Poll] SSE blocked or failed, started interval fallback for session:", sId);
    let checkAttempts = 0;
    
    pollIntervalRef.current = setInterval(async () => {
      checkAttempts++;
      if (checkAttempts > 150) { // Safety timeout after ~5 mins of idling
        cleanupMobileSync();
        setMobileStreamStatus("error");
        setMobileError("Pairing session timed out. Please refresh or regenerate the QR below.");
        return;
      }
      
      try {
        const response = await fetch(`/api/session/${sId}/status`);
        if (!response.ok) return;
        const details = await response.json();
        
        if (details.scannedText) {
          setMobileStreamStatus("received");
          cleanupMobileSync();
          handleVerifyRequest({ qrText: details.scannedText });
        } else if (details.isPcConnected || details.status === "connected") {
          setMobileStreamStatus("connected");
        }
      } catch (err) {
        console.warn("[Polling Sync Warn] Status check failed:", err);
      }
    }, 2000);
  };

  // Automated backend handshake call to stream scans wirelessly
  const startRemoteMobileSession = async () => {
    cleanupMobileSync();
    setIsInitializingMobile(true);
    setMobileError(null);
    setMobileStreamStatus("waiting");

    try {
      // 1. POST route to register pairing session ID
      const response = await fetch("/api/session/start", { method: "POST" });
      if (!response.ok) throw new Error("Could not construct cloud synchronization pipe on the server.");
      const payload = await response.json();
      const sId = payload.sessionId;
      setMobileSessionId(sId);

      // 2. Open standard EventSource stream listener on current session
      const stream = new EventSource(`/api/session/${sId}/stream`);
      esRef.current = stream;

      stream.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "registered") {
            setMobileStreamStatus("waiting");
          } else if (msg.type === "mobile_connected") {
            setMobileStreamStatus("connected");
          } else if (msg.type === "scan") {
            setMobileStreamStatus("received");
            cleanupMobileSync();
            handleVerifyRequest({ qrText: msg.qrText });
          }
        } catch (jsonErr) {
          console.error("Payload decoding failure", jsonErr);
        }
      };

      stream.onerror = (err) => {
        console.warn("[SSE Connection Warn] Re-routing real-time stream via continuous short polling backup:", err);
        stream.close();
        esRef.current = null;
        startPollingSyncFallback(sId);
      };

    } catch (err) {
      console.error("[Realtime Sync Initiation Fault]", err);
      setMobileError("Failed to initiate secure wireless sync link. Please try again.");
      setMobileStreamStatus("error");
    } finally {
      setIsInitializingMobile(false);
    }
  };

  // Switch tabs & trigger sync lifecycles automatically
  useEffect(() => {
    if (activeTab === "mobile") {
      startRemoteMobileSession();
    } else {
      cleanupMobileSync();
      setMobileSessionId(null);
      setMobileStreamStatus("idle");
      setMobileError(null);
    }
    return () => {
      cleanupMobileSync();
    };
  }, [activeTab]);

  // Load from localstorage on boot
  useEffect(() => {
    const cached = localStorage.getItem("achalan_records");
    if (cached) {
      try {
        setRecords(JSON.parse(cached));
      } catch (err) {
        setRecords(INITIAL_SAMPLES);
      }
    } else {
      setRecords(INITIAL_SAMPLES);
      localStorage.setItem("achalan_records", JSON.stringify(INITIAL_SAMPLES));
    }
  }, []);

  // Save to localstorage on change
  const saveRecords = (newRecords: ChalanRecord[]) => {
    setRecords(newRecords);
    localStorage.setItem("achalan_records", JSON.stringify(newRecords));
  };

  // Triggers backend verification APIs
  const handleVerifyRequest = async (payload: { qrText?: string; image?: string; mimeType?: string }) => {
    setIsLoading(true);
    setApiError(null);

    // Progressive step indicator for great UX
    const steps = [
      "Establishing secure portal handshake...",
      "Analyzing QR routing checksums...",
      "Extracting treasury identifiers...",
      "Running AI translation & auditor mapping...",
      "Synthesizing transaction proof..."
    ];

    let currentStep = 0;
    setLoadingProgress(steps[0]);
    const stepInterval = setInterval(() => {
      if (currentStep < steps.length - 1) {
        currentStep++;
        setLoadingProgress(steps[currentStep]);
      }
    }, 1500);

    try {
      const response = await fetch("/api/verify-chalan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      clearInterval(stepInterval);

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || "The Chalan server encountered an issue parsing the data.");
      }

      const result = await response.json();
      if (result.success && result.data) {
        setScannedResult(result.data);
      } else {
        throw new Error("Could not parse valid fields from scanned source.");
      }
    } catch (err) {
      clearInterval(stepInterval);
      setApiError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  // Camera scan callback
  const handleCameraScanSuccess = (decodedText: string) => {
    handleVerifyRequest({ qrText: decodedText });
  };

  // Image Upload callback (OCR)
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        const base64Data = reader.result.split(",")[1];
        handleVerifyRequest({
          image: base64Data,
          mimeType: file.type
        });
      }
    };
    reader.readAsDataURL(file);
  };

  // Drag over files handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          const base64Data = reader.result.split(",")[1];
          handleVerifyRequest({
            image: base64Data,
            mimeType: file.type
          });
        }
      };
      reader.readAsDataURL(file);
    } else {
      setApiError("Please drop a valid image file (PNG/JPEG) of the printed receipt.");
    }
  };

  // Pasted URL/Text handle
  const handlePastedVerify = () => {
    if (!pastedText.trim()) return;
    handleVerifyRequest({ qrText: pastedText.trim() });
  };

  // Accept and commit parsed record to history
  const handleConfirmAudit = (finalData: Omit<ChalanRecord, "id" | "scannedAt">) => {
    const newRecord: ChalanRecord = {
      ...finalData,
      id: "chalan-" + Date.now(),
      scannedAt: new Date().toISOString()
    };
    const updated = [newRecord, ...records];
    saveRecords(updated);
    setScannedResult(null); // Clear buffer
    setPastedText(""); // Clear pasted
  };

  // Manual manual form input save
  const handleManualSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.chalanNo || !manualForm.amount || !manualForm.name) {
      setApiError("Please fill out Chalan No, Amount, and Depositor Name.");
      return;
    }

    const newRecord: ChalanRecord = {
      id: "manual-" + Date.now(),
      chalanNo: manualForm.chalanNo,
      chalanDate: manualForm.chalanDate,
      amount: parseFloat(manualForm.amount) || 0,
      name: manualForm.name,
      bankName: manualForm.bankName,
      branchName: manualForm.branchName || "Manual Registry Entry",
      district: manualForm.district || "N/A",
      economicCode: manualForm.economicCode,
      verificationStatus: manualForm.verificationStatus,
      verificationSource: "Manual Office Registry Upload",
      notes: manualForm.notes,
      scannedAt: new Date().toISOString()
    };

    saveRecords([newRecord, ...records]);
    setShowManualModal(false);
    // Reset manual form
    setManualForm({
      chalanNo: "",
      chalanDate: new Date().toISOString().slice(0, 10),
      amount: "",
      name: "",
      bankName: "Sonali Bank PLC",
      branchName: "",
      district: "",
      economicCode: "1-1133-0000-0311",
      verificationStatus: "Verification Pending",
      notes: ""
    });
  };

  // Delete individual record
  const handleDeleteRecord = (id: string) => {
    const filtered = records.filter((r) => r.id !== id);
    saveRecords(filtered);
  };

  // Clear all database history
  const handleClearAll = () => {
    if (confirm("Are you sure you want to purge all records from the browser storage?")) {
      saveRecords([]);
    }
  };

  // SheetJS Excel File generation and download
  const exportToExcel = () => {
    if (records.length === 0) {
      alert("No registry records available to export.");
      return;
    }

    const rows = records.map((r, idx) => ({
      "Scan ID": r.id,
      "Serial": idx + 1,
      "Chalan No (চালান নম্বর)": r.chalanNo,
      "Chalan Date (তারিখ)": r.chalanDate,
      "Depositor Name (জমাদানকারী)": r.name,
      "Amount (BDT)": r.amount,
      "Bank Name (ব্যাংক)": r.bankName,
      "Branch Name (শাখা)": r.branchName || "N/A",
      "District (জেলা)": r.district || "N/A",
      "Treasury Code (কোড)": r.economicCode || "N/A",
      "Verification Status": r.verificationStatus,
      "Method": r.verificationSource,
      "Scan Date / Time": new Date(r.scannedAt).toLocaleString(),
      "Remarks / Notes": r.notes || ""
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Verified A-Chalan Directory");

    // Configure clean layout spacing for spreadsheet
    worksheet["!cols"] = [
      { wch: 15 }, // ID
      { wch: 8 },  // Serial
      { wch: 22 }, // Chalan No
      { wch: 13 }, // Date
      { wch: 26 }, // Name
      { wch: 15 }, // Amount
      { wch: 22 }, // Bank
      { wch: 18 }, // Branch
      { wch: 12 }, // District
      { wch: 20 }, // Treasury Code
      { wch: 20 }, // Status
      { wch: 24 }, // Method
      { wch: 22 }, // Scanned At
      { wch: 30 }  // Notes
    ];

    XLSX.writeFile(workbook, `A_Chalan_Verified_Registry_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Derive verification metrics for dashboard cards
  const totalVerifiedAmount = records
    .filter((r) => r.verificationStatus === "Verified")
    .reduce((curr, next) => curr + next.amount, 0);

  const pendingCount = records.filter((r) => r.verificationStatus === "Verification Pending").length;
  const verifiedCount = records.filter((r) => r.verificationStatus === "Verified").length;

  // Filter records based on UI configurations
  const filteredRecords = records.filter((rec) => {
    const matchSearch =
      rec.chalanNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rec.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (rec.bankName && rec.bankName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (rec.branchName && rec.branchName.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchStatus = filterStatus === "All" || rec.verificationStatus === filterStatus;
    const matchBank = filterBank === "All" || rec.bankName.toLowerCase().includes(filterBank.toLowerCase());

    return matchSearch && matchStatus && matchBank;
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-indigo-100 selection:text-indigo-900 pb-0">
      
      {/* Brand Header */}
      <header className="sticky top-0 z-40 h-20 bg-white border-b border-slate-200 flex items-center justify-between px-6 md:px-8 shrink-0">
        <div id="brand-logo-panel" className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded flex items-center justify-center text-white shadow-lg shadow-indigo-100">
            <QrCode className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
              ChalanVerify Pro
              <span className="bg-indigo-100 text-indigo-700 border border-indigo-200 text-[10px] font-bold py-0.5 px-2 rounded-full uppercase tracking-wider">
                Portal Proxy
              </span>
            </h1>
            <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold text-[10px]">Government Revenue Verification Portal</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden md:flex flex-col items-end">
            <span className="text-sm font-semibold text-slate-700">System Status</span>
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-bold">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span> Connected to iBAS++
            </span>
          </div>
          <div className="hidden md:block h-10 w-[1px] bg-slate-200"></div>
          <div className="flex items-center gap-3 bg-slate-100 px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-bold text-xs">
            <span>Scanner #04</span>
            <div className="w-6 h-6 bg-indigo-105 rounded-full border border-indigo-200"></div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-8 mt-6 flex flex-col lg:flex-row gap-6 items-start w-full">
        
        {/* LEFT COLUMN: Sidebar controllers and instructions */}
        <div className="w-full lg:w-[320px] shrink-0 flex flex-col gap-6">
          
          {/* Action Trigger Deck */}
          <div className="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm flex flex-col gap-3.5">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Audit Actions</h3>
            
            <button
              id="manual-registry-btn"
              onClick={() => setShowManualModal(true)}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-100 active:transform active:scale-95 transition text-xs font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Direct Manual Entry
            </button>
            
            <button
              id="xlsx-export-header-btn"
              onClick={exportToExcel}
              className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 active:transform active:scale-95 border border-slate-200 transition text-xs font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-indigo-600" /> Export Excel (.xlsx)
            </button>
          </div>

          {/* Device Sync state block */}
          <div className="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm flex flex-col items-center justify-center text-center pb-6">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 self-start">Device Sync</h4>
            <div className="w-12 h-12 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mb-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
              </svg>
            </div>
            <p className="text-xs font-bold text-slate-800">Mobile Validation Active</p>
            <p className="text-[9px] font-bold text-emerald-600 tracking-wider mt-0.5 uppercase flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block"></span> Local Host Connected
            </p>
          </div>

          {/* Dynamic Instructions Guide always visible in the Sidebar */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 text-white rounded-2xl p-6 shadow-md flex flex-col gap-5">
            <div className="flex flex-col gap-4">
              <span className="bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30 text-[9px] tracking-widest uppercase py-1 px-2.5 rounded-md self-start font-sans">
                Auditing Manual
              </span>
              <h3 className="font-sans font-extrabold text-white text-base tracking-tight leading-snug">
                Treasury (A-Chalan) Scanner Verification Flow
              </h3>
              <p className="text-xs text-indigo-100/90 leading-relaxed font-sans font-light">
                Secure real-time portal checks verify deposits instantly through Sonali and automated iBAS++ channels.
              </p>

              <div className="flex flex-col gap-4 mt-2 text-xs font-sans">
                <div className="flex gap-2.5 items-start">
                  <div className="w-5 h-5 rounded-full bg-indigo-500/25 border border-indigo-400/30 flex items-center justify-center font-bold text-[10px] shrink-0 text-indigo-300">
                    1
                  </div>
                  <p className="text-indigo-100/90 leading-tight">
                    <strong>Scan Bottom QR:</strong> Use phone camera scanner tab on printed treasury receipts.
                  </p>
                </div>

                <div className="flex gap-2.5 items-start">
                  <div className="w-5 h-5 rounded-full bg-indigo-500/25 border border-indigo-400/30 flex items-center justify-center font-bold text-[10px] shrink-0 text-indigo-300">
                    2
                    </div>
                    <p className="text-indigo-100/90 leading-tight">
                      <strong>Audit Ledger Matching:</strong> Link verification matches secure governmental checksums automatically.
                    </p>
                  </div>

                  <div className="flex gap-2.5 items-start">
                    <div className="w-5 h-5 rounded-full bg-indigo-500/25 border border-indigo-400/30 flex items-center justify-center font-bold text-[10px] shrink-0 text-indigo-300">
                      3
                    </div>
                    <p className="text-indigo-100/90 leading-tight">
                      <strong>AI OCR Document Fallback:</strong> No QR? Upload an image snapshot. Our intelligence reads fields in Bengali.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center bg-black/25 rounded-xl p-3 border border-white/5 text-[10px]">
                <div className="flex items-center gap-1.5 text-indigo-200">
                  <Database className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Local Cache Ready</span>
                </div>
                <span className="text-indigo-400 font-bold font-mono uppercase tracking-wide">SECURE LINK PRO</span>
              </div>
          </div>

        </div>

        {/* RIGHT COLUMN: Interactive Workspaces and Stats */}
        <div className="flex-1 w-full flex flex-col gap-6">

          {/* TOP: Informative dynamic statistics widget deck */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            <div className="p-4 bg-white border border-slate-200/60 rounded-2xl shadow-sm flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <Database className="w-5.5 h-5.5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Stored Records</p>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight mt-0.5 font-mono leading-none">{records.length}</h3>
                <p className="text-[10px] text-slate-400 font-sans mt-0.5">Slips archived</p>
              </div>
            </div>

            <div className="p-4 bg-white border border-slate-200/60 rounded-2xl shadow-sm flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <TrendingUp className="w-5.5 h-5.5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Total Verified</p>
                <h3 className="text-sm font-bold text-slate-905 tracking-tight mt-0.5 font-mono leading-none">
                  ৳{totalVerifiedAmount.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </h3>
                <p className="text-[10px] text-indigo-605 font-sans mt-0.5 font-bold text-indigo-600">Audited Ledger</p>
              </div>
            </div>

            <div className="p-4 bg-white border border-slate-200/60 rounded-2xl shadow-sm flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5.5 h-5.5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Audit Pass Rate</p>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight mt-0.5 font-mono leading-none">
                  {records.length > 0 ? `${Math.round((verifiedCount / records.length) * 100)}%` : "0%"}
                </h3>
                <p className="text-[10px] text-slate-400 font-sans mt-0.5">{verifiedCount} passed items</p>
              </div>
            </div>

            <div className="p-4 bg-white border border-slate-200/60 rounded-2xl shadow-sm flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <Clock className="w-5.5 h-5.5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Pending Sync</p>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight mt-0.5 font-mono leading-none">{pendingCount}</h3>
                <p className="text-[10px] text-slate-450 font-sans mt-0.5">Awaiting ledger check</p>
              </div>
            </div>

          </div>

        {/* MIDDLE SECTION: Interactive Scan Handlers Deck */}
        {!scannedResult && (
          <div className="w-full">
            
            {/* Input scanning controls: Tab triggers */}
            <div className="w-full bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm flex flex-col">
              <div className="flex border-b border-slate-100 bg-slate-50/50 p-1.5 gap-1">
                <button
                  id="tab-camera-btn"
                  onClick={() => { setActiveTab("camera"); setApiError(null); }}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold tracking-wide transition duration-150 flex items-center justify-center gap-1.5 ${
                    activeTab === "camera" 
                      ? "bg-white text-slate-900 shadow-sm border border-slate-200/40" 
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5 text-indigo-600" />
                  Camera Scanner
                </button>
                <button
                  id="tab-upload-btn"
                  onClick={() => { setActiveTab("upload"); setApiError(null); }}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold tracking-wide transition duration-150 flex items-center justify-center gap-1.5 ${
                    activeTab === "upload" 
                      ? "bg-white text-slate-900 shadow-sm border border-slate-200/40" 
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Upload className="w-3.5 h-3.5 text-indigo-600" />
                  Upload Image Form (OCR)
                </button>
                <button
                  id="tab-paste-btn"
                  onClick={() => { setActiveTab("paste"); setApiError(null); }}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold tracking-wide transition duration-150 flex items-center justify-center gap-1.5 ${
                    activeTab === "paste" 
                      ? "bg-white text-slate-900 shadow-sm border border-slate-200/40" 
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Clipboard className="w-3.5 h-3.5 text-indigo-600" />
                  Paste QR Data
                </button>
                <button
                  id="tab-mobile-btn"
                  onClick={() => { setActiveTab("mobile"); setApiError(null); }}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold tracking-wide transition duration-150 flex items-center justify-center gap-1.5 ${
                    activeTab === "mobile" 
                      ? "bg-white text-slate-900 shadow-sm border border-slate-200/40" 
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
                  Scan with Phone
                </button>
              </div>

              {/* Tab Viewports contents */}
              <div className="p-6">
                
                {activeTab === "camera" && (
                  <CameraScanner 
                    onScanSuccess={handleCameraScanSuccess} 
                    onScanError={(err) => setApiError(err)} 
                  />
                )}

                {activeTab === "upload" && (
                  <div 
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 bg-slate-50 hover:bg-slate-100/60 hover:border-emerald-500 rounded-xl p-8 text-center transition cursor-pointer relative"
                  >
                    <input
                      id="ocr-receipt-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="w-12 h-12 rounded-full bg-blue-100/80 flex items-center justify-center text-blue-600 mb-4 shadow-inner">
                      <Upload className="w-5.5 h-5.5" />
                    </div>
                    <h4 className="text-slate-800 text-xs font-semibold mb-1">Upload printed Chalan receipt photo</h4>
                    <p className="text-[10px] text-slate-400 font-medium max-w-sm">
                      Drag-and-drop a clear picture or PDF snapshot. The built-in Gemini OCR will read values, translate them from Bengali, and verify parameters.
                    </p>
                    <div className="mt-4 px-3 py-1 bg-white border border-slate-200 rounded-lg text-[10px] text-slate-600 font-bold tracking-wide shadow-sm hover:scale-105 active:scale-95 transition">
                      Browse Files
                    </div>
                  </div>
                )}

                {activeTab === "paste" && (
                  <div className="flex flex-col gap-4 font-sans text-xs">
                    <p className="text-[10px] text-slate-400 font-medium">
                      If scanning is slow or you copy/pasted the QR raw contents (or a live link like `https://ibass.finance.gov.bd/...`), input it manually below to inspect:
                    </p>
                    <textarea
                      id="plain-qr-text-paste"
                      rows={4}
                      value={pastedText}
                      onChange={(e) => setPastedText(e.target.value)}
                      placeholder="Paste scanned link URL or serial text string..."
                      className="w-full p-3 font-mono text-xs rounded-xl border border-slate-200 focus:border-indigo-500 bg-slate-50 outline-none transition"
                    />
                    
                    {/* Demo Sample Links selection panel */}
                    <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 flex flex-col gap-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Demo / Sandbox Test Simulator Links</span>
                      <p className="text-[10px] text-slate-500">
                        Since camera access might be sandboxed inside browser design iframes, select a demo treasury verification link below to see the complete automated parsing pipeline:
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => {
                            const sampleUrl = "https://ibass.finance.gov.bd/chalan/verify?chalan_no=T-26-05-9011&amount=5500&date=2026-05-24&bank=SonaliBank&name=Kazi+Anisur+Rahman";
                            setPastedText(sampleUrl);
                            handleVerifyRequest({ qrText: sampleUrl });
                          }}
                          className="flex-1 px-3 py-2 bg-white border border-slate-200 hover:border-indigo-500 rounded-lg text-[10px] text-slate-700 font-semibold text-left transition hover:bg-indigo-50/20 active:scale-95 flex flex-col gap-1"
                        >
                          <span className="text-indigo-600 font-bold">৳5,500 Duty Deposition</span>
                          <span className="font-mono text-[9px] text-slate-400 truncate w-full">Chalan: T-26-05-9011</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const sampleUrl = "https://ibass.finance.gov.bd/chalan/verify?chalan_no=T-25-05-4421&amount=12500&date=2026-05-23&bank=BangladeshBank&name=Bashundhara+Paper+Mills";
                            setPastedText(sampleUrl);
                            handleVerifyRequest({ qrText: sampleUrl });
                          }}
                          className="flex-1 px-3 py-2 bg-white border border-slate-200 hover:border-indigo-500 rounded-lg text-[10px] text-slate-700 font-semibold text-left transition hover:bg-indigo-50/20 active:scale-95 flex flex-col gap-1"
                        >
                          <span className="text-indigo-600 font-bold">৳12,500 Customs VAT</span>
                          <span className="font-mono text-[9px] text-slate-400 truncate w-full">Chalan: T-25-05-4421</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const sampleUrl = "https://ibass.finance.gov.bd/chalan/verify?chalan_no=T-23-01-1188&amount=850&date=2026-05-20&bank=SonaliBank&name=Farhana+Afsana";
                            setPastedText(sampleUrl);
                            handleVerifyRequest({ qrText: sampleUrl });
                          }}
                          className="flex-1 px-3 py-2 bg-white border border-slate-200 hover:border-indigo-500 rounded-lg text-[10px] text-slate-700 font-semibold text-left transition hover:bg-indigo-50/20 active:scale-95 flex flex-col gap-1"
                        >
                          <span className="text-indigo-600 font-bold">৳850 Registry Fee</span>
                          <span className="font-mono text-[9px] text-slate-400 truncate w-full">Chalan: T-23-01-1188</span>
                        </button>
                      </div>
                    </div>

                    <button
                      id="verify-pasted-text-btn"
                      onClick={handlePastedVerify}
                      disabled={!pastedText.trim()}
                      className="px-4 py-2.5 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-40 select-none cursor-pointer self-start flex items-center gap-2"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                      Verify Link with Proxy Handshake
                    </button>
                  </div>
                )}

                {activeTab === "mobile" && (
                  <div className="flex flex-col md:flex-row gap-6 items-center md:items-stretch font-sans">
                    {/* Left Panel: Pairing instructions & QR Code */}
                    <div className="flex-1 flex flex-col justify-center bg-slate-50 border border-slate-150 p-6 rounded-2xl">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0 border border-indigo-150">
                          <Smartphone className="w-5 h-5 text-indigo-600 animate-pulse" />
                        </div>
                        <div>
                          <h4 className="text-slate-800 text-sm font-bold tracking-tight">Wireless Mobilizer Scan</h4>
                          <p className="text-[10px] text-slate-400 mt-1 font-medium leading-relaxed">
                            No camera connected on this PC? Uncomfortable using your webcam? Scan other physical chalans instantly with your personal cell-phone!
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 mt-4 text-xs font-medium text-slate-600 leading-normal">
                        <div className="flex gap-2">
                          <span className="w-5 h-5 shrink-0 rounded-full bg-slate-200 flex items-center justify-center font-bold text-[10px] text-slate-700">1</span>
                          <p>Point your smartphone camera at the QR code shown here, then tap the popup message to request pairing link.</p>
                        </div>
                        <div className="flex gap-2">
                          <span className="w-5 h-5 shrink-0 rounded-full bg-slate-200 flex items-center justify-center font-bold text-[10px] text-slate-700">2</span>
                          <p>Focus your cell-phone camera on any bank treasury printed A-Chalan chalan barcode slip.</p>
                        </div>
                        <div className="flex gap-2">
                          <span className="w-5 h-5 shrink-0 rounded-full bg-slate-200 flex items-center justify-center font-bold text-[10px] text-slate-700">3</span>
                          <p>Watch as your computer instantly detects the scanned token, launches the API verify auditor, and inserts everything auto-filled!</p>
                        </div>
                      </div>

                      {/* Display direct fallback pairing text anchor link */}
                      {mobileSessionId && (
                        <div className="mt-5 pt-4 border-t border-slate-200/80">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 font-sans">Trouble scanning? Open Link on Mobile:</p>
                          <div className="flex gap-1.5 items-center bg-white p-2 rounded-xl border border-slate-200 shadow-sm font-sans">
                            <input 
                              type="text" 
                              readOnly 
                              value={`${window.location.origin}?session=${mobileSessionId}`}
                              className="font-mono text-[10px] text-slate-500 bg-transparent outline-none flex-1 truncate select-all px-1.5"
                            />
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(`${window.location.origin}?session=${mobileSessionId}`);
                              }}
                              className="px-2.5 py-1 bg-slate-800 text-white font-bold text-[9px] hover:bg-slate-700 rounded-lg active:scale-95 transition whitespace-nowrap"
                            >
                              Copy Link
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right Panel: Live Link Visual pairing and stream indicators */}
                    <div className="w-[300px] shrink-0 flex flex-col items-center justify-center p-6 border border-slate-200 bg-white rounded-2xl shadow-sm text-center gap-4 relative overflow-hidden font-sans">
                      {isInitializingMobile ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-3">
                          <div className="w-10 h-10 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin" />
                          <p className="text-xs text-slate-500 font-bold">Spinning up secure wireless channel...</p>
                        </div>
                      ) : mobileSessionId ? (
                        <>
                          {/* QR RENDER */}
                          <div className="relative p-3 bg-white border border-slate-200 rounded-2xl shadow-inner group overflow-hidden">
                            <img
                              referrerPolicy="no-referrer"
                              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`${window.location.origin}?session=${mobileSessionId}`)}`}
                              alt="Scan Pairing Code"
                              className="w-[180px] h-[180px] object-contain block transition duration-350"
                            />
                            {/* Visual highlight mask in corresponding statuses */}
                            {mobileStreamStatus === "connected" && (
                              <div className="absolute inset-0 bg-emerald-500/95 flex flex-col items-center justify-center text-white p-4 font-sans animate-fade-in">
                                <CheckCircle2 className="w-10 h-10 animate-bounce" />
                                <span className="text-xs font-bold mt-2">Mobile Synchronized!</span>
                                <span className="text-[10px] opacity-80 mt-1">Ready for scans...</span>
                              </div>
                            )}
                            {mobileStreamStatus === "received" && (
                              <div className="absolute inset-0 bg-indigo-600/95 flex flex-col items-center justify-center text-white p-4 font-sans animate-fade-in">
                                <div className="w-8 h-8 rounded-full border-2 border-white border-t-transparent animate-spin mb-1" />
                                <span className="text-xs font-bold mt-1">Payload Received!</span>
                                <span className="text-[10px] opacity-80">Syncing database...</span>
                              </div>
                            )}
                          </div>

                          {/* DYNAMIC REAL-TIME STATUS BLOCK */}
                          <div className="w-full flex flex-col items-center gap-2 pt-1 border-t border-slate-100 mt-1">
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 border border-slate-150 rounded-full shadow-inner leading-none">
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                mobileStreamStatus === "connected" 
                                  ? "bg-emerald-500 animate-pulse" 
                                  : mobileStreamStatus === "waiting" 
                                  ? "bg-indigo-500 animate-ping" 
                                  : mobileStreamStatus === "received" 
                                  ? "bg-blue-500 animate-spin"
                                  : "bg-amber-500"
                              }`} />
                              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                                {mobileStreamStatus === "waiting" && "Waiting for device..."}
                                {mobileStreamStatus === "connected" && "MOBILE DEVICE CONNECTED"}
                                {mobileStreamStatus === "received" && "SCAN COMPLETED"}
                                {mobileStreamStatus === "error" && "PAIRING EXPIRED"}
                              </span>
                            </div>
                            
                            <p className="text-[10px] text-slate-400 font-medium leading-normal max-w-[220px]">
                              {mobileStreamStatus === "waiting" && "Point your handheld camera at this screen to instantly connect."}
                              {mobileStreamStatus === "connected" && "All set! Please scan Chalan ledger now. Desktop will auto-fill."}
                              {mobileStreamStatus === "received" && "Data received! Running compliance and scraping checks..."}
                              {mobileStreamStatus === "error" && "Pairing session failed or expired. Please reset below."}
                            </p>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 gap-3">
                          <AlertCircle className="w-8 h-8 text-rose-500" />
                          <p className="text-xs text-slate-500 font-bold">{mobileError || "Pairing channel offline"}</p>
                        </div>
                      )}

                      {/* Bridge Regenerator / Troubleshooting Button */}
                      <button
                        type="button"
                        onClick={startRemoteMobileSession}
                        className="mt-1 w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 font-semibold rounded-xl text-[10px] tracking-wide transition border border-slate-200 active:scale-95 flex items-center justify-center gap-1.5"
                      >
                        <RefreshCw className="w-3 h-3 text-slate-500" />
                        Regenerate Pairing Key
                      </button>
                    </div>
                  </div>
                )}

                {/* API System Error notifications banner */}
                {apiError && (
                  <div className="mt-4 p-3.5 bg-rose-50 border border-rose-100/80 rounded-xl text-xs text-rose-800 sm:flex gap-3 items-start animate-fade-in sm:text-left">
                    <AlertCircle className="w-4.5 h-4.5 text-rose-600 shrink-0 mt-0.5 mx-auto" />
                    <div className="mt-2 sm:mt-0">
                      <p className="font-bold">Error Processing A-Chalan Verification</p>
                      <p className="mt-0.5 text-slate-600 leading-normal text-[11px]">{apiError}</p>
                    </div>
                  </div>
                )}

              </div>
            </div>

          </div>
        )}

        {/* LOADING ANIMATED BACKDROP COVER */}
        <AnimatePresence>
          {isLoading && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-950/70 z-50 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center font-sans text-white select-none"
            >
              <div className="relative w-20 h-20 mb-6">
                {/* Visual pulsating circles representing safe secure link checks */}
                <div className="absolute inset-0 rounded-full border-4 border-dashed border-emerald-500 animate-spin" style={{ animationDuration: "12s" }} />
                <div className="absolute inset-2.5 rounded-full border-4 border-dotted border-blue-400 animate-spin" style={{ animationDuration: "8s" }} />
                <div className="absolute inset-5 rounded-full bg-emerald-600/35 flex items-center justify-center">
                  <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin" style={{ animationDuration: "3s" }} />
                </div>
              </div>

              <h4 className="text-base font-bold tracking-tight text-white">Verifying Treasury Ledger...</h4>
              <p className="text-xs text-slate-300 max-w-sm mt-1.5 leading-relaxed">
                Our Cloud Portal is checking parameters and making connection handshakes with official verification engines.
              </p>

              {/* Informative stage loader line */}
              <div className="mt-4 px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[10px] text-emerald-300 font-mono flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
                {loadingProgress}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* COMPONENT: ACTIVE SLIP CONTROL (Rendered on successful text or image verification) */}
        {scannedResult && (
          <div className="bg-white border border-slate-200/80 rounded-3xl p-4 md:p-6 shadow-sm flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider block">Scan Process complete</span>
                <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-1.5 mt-0.5">
                  <Sparkles className="w-4 h-4 text-emerald-500" />
                  Structured Transaction Data Ready for Reconciliation
                </h2>
              </div>
              <button
                id="close-scr-result-btn"
                onClick={() => setScannedResult(null)}
                className="w-7 h-7 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <ChalanVisualizer 
              initialData={scannedResult}
              onConfirm={handleConfirmAudit}
              onCancel={() => setScannedResult(null)}
            />
          </div>
        )}

        {/* BOTTOM SECTION: Historic Audited Registry Data Table */}
        <div id="historical-registry-section" className="bg-white border border-slate-200/60 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          
          {/* Table Header with searching, filtering options and clear commands */}
          <div className="p-5 md:p-6 border-b border-slate-100 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
            
            <div>
              <h3 className="font-sans font-bold text-slate-900 text-base flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-600" />
                Verified Receipt Registry
              </h3>
              <p className="text-[10px] text-slate-400 font-medium">Reconciled history from physical scans and uploads</p>
            </div>

            <div className="w-full md:w-auto flex flex-wrap gap-2.5 items-center font-sans text-xs">
              
              {/* Searching index inputs */}
              <div className="relative flex-1 md:flex-initial min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="records-table-search-input"
                  type="text"
                  placeholder="Search number, name, bank branch..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-1.5 border border-slate-200 bg-slate-50 rounded-lg text-xs outline-none focus:border-emerald-500 transition"
                />
              </div>

              {/* Filter selections */}
              <select
                id="bank-filter-selection"
                value={filterBank}
                onChange={(e) => setFilterBank(e.target.value)}
                className="py-1.5 px-3 border border-slate-200 bg-slate-50 text-slate-700 rounded-lg outline-none select select-xs focus:border-emerald-500"
              >
                <option value="All">All Banks</option>
                <option value="Sonali">Sonali Bank</option>
                <option value="Bangladesh Bank">Bangladesh Bank</option>
                <option value="Agrani">Agrani Bank</option>
                <option value="Janata">Janata Bank</option>
                <option value="Rupali">Rupali Bank</option>
              </select>

              <select
                id="status-filter-selection"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="py-1.5 px-3 border border-slate-200 bg-slate-50 text-slate-700 rounded-lg outline-none select select-xs focus:border-emerald-500"
              >
                <option value="All">All Statuses</option>
                <option value="Verified">Verified</option>
                <option value="Verification Pending">Verification Pending</option>
                <option value="Invalid/Unverified">Invalid/Unverified</option>
              </select>

              {records.length > 0 && (
                <button
                  id="clear-all-records-btn"
                  onClick={handleClearAll}
                  className="px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-100 rounded-lg font-semibold flex items-center gap-1 mt-1 sm:mt-0"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Purge Cache
                </button>
              )}

            </div>
          </div>

          {/* Core dynamic table */}
          <div className="overflow-x-auto w-full">
            {filteredRecords.length > 0 ? (
              <table className="w-full text-left border-collapse text-xs font-sans min-w-[1000px]">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4 text-center w-12">No.</th>
                    <th className="py-3 px-4">Chalan Number</th>
                    <th className="py-3 px-4">Receipt Date</th>
                    <th className="py-3 px-4">Depositor Name</th>
                    <th className="py-3 px-4 text-right">Amount (BDT)</th>
                    <th className="py-3 px-4">Bank & Branch</th>
                    <th className="py-3 px-4">Treasury Code</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4">Scan Origin</th>
                    <th className="py-3 px-4 text-center w-12">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredRecords.map((rec, index) => (
                    <tr key={rec.id} className="hover:bg-slate-50/50 transition">
                      <td className="py-3 px-4 text-center text-slate-400 font-mono">{index + 1}</td>
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold tracking-wider text-slate-900 bg-slate-100 py-0.5 px-2 rounded">
                          {rec.chalanNo}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-medium">{rec.chalanDate}</td>
                      <td className="py-3 px-4 capitalize font-semibold text-slate-800">{rec.name}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        ৳{rec.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-800 text-[11px]">{rec.bankName}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{rec.branchName || "N/A"} {rec.district ? `, ${rec.district}` : ""}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs text-purple-700 bg-purple-50 border border-purple-100 py-0.5 px-1.5 rounded">
                          {rec.economicCode || "N/A"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center gap-1 font-bold py-1 px-2.5 rounded-full text-[10px] uppercase tracking-wider ${
                          rec.verificationStatus === "Verified"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                            : rec.verificationStatus === "Verification Pending"
                            ? "bg-amber-50 text-amber-700 border border-amber-100"
                            : "bg-red-50 text-red-700 border border-red-100"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            rec.verificationStatus === "Verified"
                              ? "bg-emerald-500"
                              : rec.verificationStatus === "Verification Pending"
                              ? "bg-amber-500"
                              : "bg-red-500"
                          }`} />
                          {rec.verificationStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-[10.5px] text-slate-600 font-medium leading-normal">{rec.verificationSource}</div>
                        <div className="text-[9.5px] text-slate-400 mt-0.5 font-sans">
                          {new Date(rec.scannedAt).toLocaleString()}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          id={`delete-record-btn-${rec.id}`}
                          onClick={() => handleDeleteRecord(rec.id)}
                          className="w-7 h-7 bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded-lg border border-slate-100 hover:border-rose-100 flex items-center justify-center transition shadow-sm"
                          title="Purge record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="py-16 text-center flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 shadow-inner">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-slate-700 font-bold text-xs">No records correspond to filters</h4>
                  <p className="text-[10px] text-slate-400 max-w-sm mt-0.5 mx-auto leading-relaxed">
                    Check spelling correctness or scan/upload a printed A-Chalan format to add new rows directly.
                  </p>
                </div>
              </div>
            )}
          </div>

        </div>

      </div>

      </main>

      {/* MODAL: MANUAL OFFICE DIRECTORY INPUT FOR CHALLAN */}
      <AnimatePresence>
        {showManualModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop cover */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowManualModal(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="relative w-full max-w-lg bg-white rounded-2xl border border-slate-100 p-6 shadow-xl flex flex-col gap-4 font-sans text-xs max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                    <Database className="w-4.5 h-4.5 text-slate-600" />
                    Enter Treasury Record Manual Copy
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Direct manual upload to historic registry directory</p>
                </div>
                <button
                  id="close-manual-modal-btn"
                  onClick={() => setShowManualModal(false)}
                  className="w-7 h-7 bg-slate-550 hover:bg-slate-200 text-slate-500 hover:text-slate-850 rounded-full flex items-center justify-center transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleManualSave} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                <div>
                  <label htmlFor="manual-chalanNo" className="block text-slate-500 font-medium mb-1">Chalan No *</label>
                  <input
                    id="manual-chalanNo"
                    type="text"
                    required
                    value={manualForm.chalanNo}
                    onChange={(e) => setManualForm({ ...manualForm, chalanNo: e.target.value })}
                    placeholder="e.g. T-26-05-9011..."
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-indigo-500 font-mono transition"
                  />
                </div>

                <div>
                  <label htmlFor="manual-chalanDate" className="block text-slate-500 font-medium mb-1">Chalan Date *</label>
                  <input
                    id="manual-chalanDate"
                    type="date"
                    required
                    value={manualForm.chalanDate}
                    onChange={(e) => setManualForm({ ...manualForm, chalanDate: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-indigo-500 font-mono transition"
                  />
                </div>

                <div>
                  <label htmlFor="manual-amount" className="block text-slate-500 font-medium mb-1">Amount BDT (৳) *</label>
                  <input
                    id="manual-amount"
                    type="number"
                    required
                    value={manualForm.amount}
                    onChange={(e) => setManualForm({ ...manualForm, amount: e.target.value })}
                    placeholder="e.g. 5000"
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-indigo-500 font-semibold transition"
                  />
                </div>

                <div>
                  <label htmlFor="manual-name" className="block text-slate-500 font-medium mb-1">Depositor Name *</label>
                  <input
                    id="manual-name"
                    type="text"
                    required
                    value={manualForm.name}
                    onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })}
                    placeholder="Full name or company name"
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-indigo-500 font-medium transition"
                  />
                </div>

                <div>
                  <label htmlFor="manual-bank" className="block text-slate-500 font-medium mb-1">Bank Name *</label>
                  <select
                    id="manual-bank"
                    value={manualForm.bankName}
                    onChange={(e) => setManualForm({ ...manualForm, bankName: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-indigo-500 transition"
                  >
                    <option value="Sonali Bank PLC">Sonali Bank PLC</option>
                    <option value="Bangladesh Bank">Bangladesh Bank</option>
                    <option value="Agrani Bank">Agrani Bank</option>
                    <option value="Janata Bank">Janata Bank</option>
                    <option value="Rupali Bank">Rupali Bank</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="manual-branch" className="block text-slate-500 font-medium mb-1">Branch Name</label>
                  <input
                    id="manual-branch"
                    type="text"
                    value={manualForm.branchName}
                    onChange={(e) => setManualForm({ ...manualForm, branchName: e.target.value })}
                    placeholder="e.g. Local Office, Ramna Branch"
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-indigo-500 transition"
                  />
                </div>

                <div>
                  <label htmlFor="manual-district" className="block text-slate-500 font-medium mb-1">District</label>
                  <input
                    id="manual-district"
                    type="text"
                    value={manualForm.district}
                    onChange={(e) => setManualForm({ ...manualForm, district: e.target.value })}
                    placeholder="e.g. Dhaka"
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-indigo-500 transition"
                  />
                </div>

                <div>
                  <label htmlFor="manual-economic" className="block text-slate-500 font-medium mb-1">economic treasury code</label>
                  <input
                    id="manual-economic"
                    type="text"
                    value={manualForm.economicCode}
                    onChange={(e) => setManualForm({ ...manualForm, economicCode: e.target.value })}
                    placeholder="e.g. 1-1133-0000-0311"
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-indigo-500 font-mono transition"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="manual-status" className="block text-slate-500 font-medium mb-1">Verification Status</label>
                  <select
                    id="manual-status"
                    value={manualForm.verificationStatus}
                    onChange={(e) => setManualForm({ ...manualForm, verificationStatus: e.target.value as any })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-indigo-500 transition"
                  >
                    <option value="Verified">Verified</option>
                    <option value="Verification Pending">Verification Pending</option>
                    <option value="Invalid/Unverified">Invalid/Unverified</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="manual-notes" className="block text-slate-500 font-medium mb-1">Remarks or Review comments</label>
                  <textarea
                    id="manual-notes"
                    value={manualForm.notes}
                    onChange={(e) => setManualForm({ ...manualForm, notes: e.target.value })}
                    rows={2}
                    placeholder="Add manual audit notes, economy code mappings, or remarks..."
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-indigo-500 resize-none transition"
                  />
                </div>

                <div className="sm:col-span-2 flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                  <button
                    id="cancel-manual-form-btn"
                    type="button"
                    onClick={() => setShowManualModal(false)}
                    className="px-4 py-2 border border-slate-200 hover:bg-slate-50 active:transform active:scale-95 text-slate-600 font-semibold rounded-lg transition"
                  >
                    Cancel
                  </button>
                  <button
                    id="save-manual-form-btn"
                    type="submit"
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/10 active:transform active:scale-95 font-semibold rounded-lg transition"
                  >
                    Save Record
                  </button>
                </div>

              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
