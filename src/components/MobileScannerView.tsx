import React, { useState, useEffect, useRef } from "react";
import { 
  Smartphone, 
  CheckCircle2, 
  Wifi, 
  AlertCircle, 
  RefreshCw, 
  Camera, 
  Upload,
  ShieldAlert,
  Sparkles,
  ChevronRight,
  Info
} from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import CameraScanner from "./CameraScanner";

interface MobileScannerViewProps {
  sessionId: string;
}

export default function MobileScannerView({ sessionId }: MobileScannerViewProps) {
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "failed">("connecting");
  const [scanStatus, setScanStatus] = useState<"scanning" | "sending" | "success" | "error">("scanning");
  const [lastScannedData, setLastScannedData] = useState<string>("");
  const [errorText, setErrorText] = useState<string>("");
  const [scanCount, setScanCount] = useState<number>(0);

  // Secure context detection.
  // Standard cameras require HTTPS or localhost. If opened on http://192.168.0.x, window.isSecureContext is false.
  const isSecure = typeof window !== "undefined" && (
    window.isSecureContext || 
    window.location.hostname === "localhost" || 
    window.location.hostname === "127.0.0.1"
  );

  const [scanMode, setScanMode] = useState<"live" | "photo">(isSecure ? "live" : "photo");
  const [isFileDecoding, setIsFileDecoding] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const qrFileDecoderRef = useRef<Html5Qrcode | null>(null);

  // Notify PC browser of mobile join/pairing on mount
  useEffect(() => {
    let active = true;
    const establishPairing = async () => {
      try {
        setConnectionStatus("connecting");
        const response = await fetch(`/api/session/${sessionId}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });
        
        if (!response.ok) {
          throw new Error("Unable to pair session on server.");
        }
        
        if (active) {
          setConnectionStatus("connected");
          console.log("[Mobile Scan] Paired successfully with session ID:", sessionId);
        }
      } catch (err) {
        if (active) {
          setConnectionStatus("failed");
          setErrorText("Could not pair with the desktop session. Ensure your PC still has the QR code page open.");
        }
      }
    };

    establishPairing();
    return () => {
      active = false;
    };
  }, [sessionId]);

  // Clean up decoder on unmount
  useEffect(() => {
    return () => {
      if (qrFileDecoderRef.current) {
        qrFileDecoderRef.current = null;
      }
    };
  }, []);

  // Handler for mobile QR capture (both live stream and file capture)
  const handleMobileScanSuccess = async (scannedText: string) => {
    if (scannedText === lastScannedData && scanStatus === "success") {
      return;
    }

    setScanStatus("sending");
    setLastScannedData(scannedText);
    setErrorText("");

    // Trigger haptic vibration on mobile browser (standard Web API)
    try {
      if ("vibrate" in navigator) {
        navigator.vibrate([150, 50, 100]);
      }
    } catch (vibeErr) {
      console.warn("Vibration not supported on this browser or user permission denied", vibeErr);
    }

    try {
      const response = await fetch(`/api/session/${sessionId}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrText: scannedText })
      });

      if (!response.ok) {
        throw new Error("Failed to transmit scanning buffer data.");
      }

      setScanStatus("success");
      setScanCount(prev => prev + 1);
    } catch (err) {
      console.error("[Mobile Scan Send Error]", err);
      setScanStatus("error");
      setErrorText("The scanned link could not be pushed to your PC screen. Please check your internet connectivity and try again.");
    }
  };

  // Decode file fallback using native camera capture photo
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    
    setIsFileDecoding(true);
    setErrorText("");
    
    try {
      const tempElementId = "temp-qr-file-decoder";
      let html5QrCode = qrFileDecoderRef.current;
      
      if (!html5QrCode) {
        let container = document.getElementById(tempElementId);
        if (!container) {
          container = document.createElement("div");
          container.id = tempElementId;
          container.style.display = "none";
          document.body.appendChild(container);
        }
        html5QrCode = new Html5Qrcode(tempElementId);
        qrFileDecoderRef.current = html5QrCode;
      }

      // Read & decode the QR Code from the snapped file on-the-fly!
      const decodedText = await html5QrCode.scanFile(file, false);
      setIsFileDecoding(false);
      
      // Send decoded text to PC
      await handleMobileScanSuccess(decodedText);
    } catch (err) {
      console.error("Failed to decode code from image file:", err);
      setIsFileDecoding(false);
      setScanStatus("error");
      setErrorText(
        "No valid barcode or QR code was detected in the photo. " +
        "Please make sure the QR code/barcode is highly visible, flat, well-lit, and in focus, then try again."
      );
    } finally {
      // Reset input element value so same photo can be snapped if needed
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleScanNext = () => {
    setScanStatus("scanning");
    setLastScannedData("");
    setErrorText("");
  };

  const triggerFileCapture = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30">
      {/* Hidden system camera file capture element */}
      <input 
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelected}
        className="hidden"
      />

      {/* Mobile Top Header Banner */}
      <header className="px-4 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-inner">
            <Smartphone className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white leading-tight">Mobile Chalan Scan</h1>
            <p className="text-[10px] text-slate-400 font-medium">Remote Scanning Gateway</p>
          </div>
        </div>
        
        {/* Real-time sync connection badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-full">
          <span className={`w-1.5 h-1.5 rounded-full ${
            connectionStatus === "connected" 
              ? "bg-emerald-400 animate-pulse" 
              : connectionStatus === "connecting" 
              ? "bg-amber-400 animate-spin" 
              : "bg-rose-400"
          }`} />
          <span className="text-[9px] font-bold tracking-wider uppercase text-slate-400">
            {connectionStatus === "connected" ? "SYNC LIVE" : connectionStatus === "connecting" ? "PAIRING..." : "DISCONNECTED"}
          </span>
        </div>
      </header>

      {/* Main Container area */}
      <main className="flex-1 p-4 flex flex-col gap-4 max-w-md mx-auto w-full">
        
        {/* Connection failures warning */}
        {connectionStatus === "failed" && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-2.5 text-xs text-rose-300 animate-fade-in">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-200">Pairing Handshake Failed</p>
              <p className="text-[10px] opacity-95 mt-0.5">{errorText}</p>
              <button 
                onClick={() => window.location.reload()}
                className="mt-3 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px] rounded-lg transition-transform active:scale-95 flex items-center gap-1.5"
              >
                <RefreshCw className="w-3 h-3" /> Retry Wireless Pair
              </button>
            </div>
          </div>
        )}

        {/* Dynamic Status / Control Selector Card */}
        {connectionStatus === "connected" && (
          <div className="flex flex-col flex-1 justify-center gap-4">
            
            {/* Mode selection toggle for HTTPS restriction feedback */}
            {scanStatus === "scanning" && (
              <div className="p-1.5 bg-slate-950 rounded-xl border border-slate-800 flex gap-1">
                <button
                  type="button"
                  onClick={() => setScanMode("photo")}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                    scanMode === "photo"
                      ? "bg-indigo-600 text-white shadow"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Snap Photo & Scan
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!isSecure) {
                      alert("Camera/video streams are blocked on non-secure origins (http). Setting to 'Snap Photo' instead. See troubleshooting below.");
                      setScanMode("photo");
                    } else {
                      setScanMode("live");
                    }
                  }}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                    scanMode === "live"
                      ? "bg-indigo-600 text-white shadow"
                      : "text-slate-400 hover:text-slate-200"
                  } ${!isSecure ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  Live Stream Feed
                </button>
              </div>
            )}

            {/* Insecure HTTP Context Alert and Guidance */}
            {!isSecure && scanStatus === "scanning" && (
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2.5 text-xs text-amber-200">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-100">IP Connection Detected (Insecure Context)</p>
                  <p className="text-[10px] opacity-90 mt-0.5 leading-relaxed">
                    Local connections like <code className="bg-slate-950/50 px-1 py-0.5 rounded font-mono text-amber-300">http://192.168.0.x</code> block video streaming permissions in mobile browsers (Safari/Chrome).
                  </p>
                  <p className="text-[10px] text-indigo-400 font-semibold mt-1">
                    ✔ Simply use "Snap Photo & Scan" below – this bypasses all browser blocks automatically!
                  </p>
                </div>
              </div>
            )}

            {/* STAGE A: ACTIVE SCANNER VIEW */}
            {scanStatus === "scanning" && (
              <div className="flex-1 flex flex-col gap-3">
                {scanMode === "photo" ? (
                  /* SECURE-RELIABLE CAPTURE DESIGN */
                  <div className="flex-1 min-h-[300px] bg-slate-950 border border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-center text-center gap-6 shadow-2xl relative overflow-hidden">
                    {/* Viewfinder simulation bounds */}
                    <div className="absolute inset-4 border border-slate-800/40 pointer-events-none rounded-xl">
                      <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-indigo-500" />
                      <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-indigo-500" />
                      <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-indigo-500" />
                      <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-indigo-500" />
                    </div>

                    <div className="w-14 h-14 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 animate-pulse">
                      <Camera className="w-7 h-7" />
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-slate-200">Bypass Browser Blocks</h3>
                      <p className="text-[10px] text-slate-400 mt-1 max-w-xs leading-relaxed">
                        Tap below to snap a raw snapshot of the printed A-Chalan barcode with your native camera app.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={triggerFileCapture}
                      disabled={isFileDecoding}
                      className="w-full max-w-xs py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg transition active:scale-95 flex items-center justify-center gap-2"
                    >
                      {isFileDecoding ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Processing Barcode...
                        </>
                      ) : (
                        <>
                          <Camera className="w-4 h-4" />
                          Capture Chalan Photo
                        </>
                      )}
                    </button>
                    
                    <div className="text-[9px] text-slate-500 flex items-center gap-1.5">
                      <Info className="w-3 h-3 text-indigo-400 shrink-0" />
                      Runs directly inside your browser. No files are saved on your phone.
                    </div>
                  </div>
                ) : (
                  /* LIVE STREAM VIDEO IF SECURE */
                  <div className="flex-1 flex flex-col gap-2">
                    <div className="text-center py-1">
                      <p className="text-xs text-slate-300 font-medium">Position code in the center square box</p>
                    </div>
                    
                    <div className="flex-1 bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl relative min-h-[300px]">
                      <CameraScanner 
                        onScanSuccess={handleMobileScanSuccess} 
                        onScanError={(err) => {
                          setScanStatus("error");
                          setErrorText(err || "Camera stream block encountered.");
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STAGE B: TRANSMITTING PUSH PAYLOAD OR INTERMEDIATE SPINNER */}
            {scanStatus === "sending" && (
              <div className="flex-1 bg-slate-950 rounded-3xl border border-slate-800 shadow-2xl p-8 flex flex-col items-center justify-center text-center gap-4 py-16 animate-fade-in">
                <div className="w-16 h-16 rounded-full bg-indigo-500/10 border border-indigo-400/20 flex items-center justify-center text-indigo-400 animate-spin">
                  <RefreshCw className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-200">Transmitting Chalan Scans...</h3>
                  <p className="text-[10px] text-slate-400 mt-1 max-w-xs leading-normal">
                    Establishing real-time gateway push, sending QR signature string to paired PC browser...
                  </p>
                </div>
                <div className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 font-mono text-[9px] break-all max-w-full text-center">
                  Session: {sessionId}
                </div>
              </div>
            )}

            {/* STAGE C: TRANS-DELIVERED SUCCESS SCREEN CARD */}
            {scanStatus === "success" && (
              <div className="flex-1 bg-slate-950 rounded-3xl border border-emerald-500/20 shadow-2xl p-8 flex flex-col items-center justify-center text-center gap-5 py-14 animate-fade-in">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-400/20 flex items-center justify-center text-emerald-400 scale-105 transition shadow-inner animate-pulse">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                
                <div>
                  <h3 className="text-sm font-bold text-slate-100">✔ Scanned & Delivered!</h3>
                  <p className="text-[10px] text-slate-300 mt-1">
                    Receipt data was successfully received by your computer.
                  </p>
                  <p className="text-[10px] text-indigo-400 font-bold mt-1.5">
                    Check your PC screen to confirm verification.
                  </p>
                </div>

                <div className="w-full bg-slate-900 border border-slate-800/80 rounded-xl p-3 flex flex-col gap-1.5 text-left">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">Last Scanned Value:</span>
                  <p className="font-mono text-[10px] text-slate-200 break-all select-all leading-tight">
                    {lastScannedData || "N/A"}
                  </p>
                </div>

                <div className="flex flex-col gap-2 w-full mt-2">
                  <button
                    onClick={handleScanNext}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-lg transition active:scale-95"
                  >
                    Scan Another Chalan (Total: {scanCount})
                  </button>
                  <p className="text-[9px] text-slate-500">
                    Saves you from manual serial number entries. Simply tap to scan another slip.
                  </p>
                </div>
              </div>
            )}

            {/* STAGE D: FAULT DISPLAY CARD */}
            {scanStatus === "error" && (
              <div className="flex-1 bg-slate-950 rounded-3xl border border-rose-500/20 shadow-2xl p-8 flex flex-col items-center justify-center text-center gap-4 py-14 animate-fade-in">
                <div className="w-14 h-14 rounded-full bg-rose-500/10 border border-rose-400/20 flex items-center justify-center text-rose-400">
                  <AlertCircle className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-200 font-sans">Error Processing Code</h3>
                  <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed max-w-xs mx-auto">
                    {errorText || "Could not read camera capture frames or lost pairing."}
                  </p>
                </div>

                <div className="flex flex-col gap-1 w-full mt-4">
                  <button
                    onClick={handleScanNext}
                    className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition"
                  >
                    Retry Active Scan View
                  </button>
                </div>
              </div>
            )}

          </div>
        )}

        {/* Pairing/Help indicator info footer */}
        <div className="mt-auto pt-6 text-center text-slate-500 text-[10px] border-t border-slate-800/40">
          <p>Handshaking session: <span className="font-mono text-slate-400 text-[9px] bg-slate-950/40 px-1 py-0.5 rounded border border-slate-800">{sessionId.slice(0, 14)}...</span></p>
          <p className="mt-1 opacity-80">Requires an internet connection on both desktop and mobile.</p>
        </div>

      </main>
    </div>
  );
}
