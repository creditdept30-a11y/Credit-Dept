import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, CameraOff, RefreshCw, AlertCircle } from "lucide-react";

interface CameraScannerProps {
  onScanSuccess: (text: string) => void;
  onScanError?: (error: string) => void;
}

export default function CameraScanner({ onScanSuccess, onScanError }: CameraScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const qrRef = useRef<Html5Qrcode | null>(null);
  const scannerId = "qr-reader-viewport";

  // Scan initialization function
  const startScan = async (cameraId: string) => {
    setErrorMessage(null);
    try {
      let html5QrCode = qrRef.current;
      if (!html5QrCode) {
        html5QrCode = new Html5Qrcode(scannerId);
        qrRef.current = html5QrCode;
      } else if (html5QrCode.isScanning) {
        try {
          await html5QrCode.stop();
        } catch (e) {
          console.warn("Stopping active scanner encountered issue:", e);
        }
      }

      setIsScanning(true);

      const config = {
        fps: 12,
        qrbox: (width: number, height: number) => {
          const size = Math.min(width, height) * 0.7;
          return { width: size, height: size };
        },
      };

      // Try ideal cameraId first, falling back to facingMode
      const cameraConstraint = cameraId 
        ? { deviceId: { ideal: cameraId } } 
        : { facingMode: "environment" };

      try {
        await html5QrCode.start(
          cameraConstraint,
          config,
          (decodedText) => {
            try {
              const beep = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAAAnAAA=");
              beep.volume = 0.2;
              beep.play().catch(() => {});
            } catch {}
            
            onScanSuccess(decodedText);
            stopScan();
          },
          () => {
            // Noise reduction, ignore standard un-scanned frames
          }
        );
      } catch (innerErr) {
        console.warn("Camera start failed with constraints, retrying with default environment facingMode...", innerErr);
        // Fallback: start with generic environment camera ignoring exact deviceId locks
        await html5QrCode.start(
          { facingMode: "environment" },
          config,
          (decodedText) => {
            try {
              const beep = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAAAnAAA=");
              beep.volume = 0.2;
              beep.play().catch(() => {});
            } catch {}
            
            onScanSuccess(decodedText);
            stopScan();
          },
          () => {}
        );
      }
    } catch (err) {
      console.error("Failed to start camera scan:", err);
      const errStr = String(err);
      if (errStr.includes("NotReadableError") || errStr.includes("Could not start video source")) {
        setErrorMessage(
          "Your camera source is currently occupied or locked by another window, program, or background browser tab. " +
          "Please close other apps using your webcam, open this application in a New Tab to escape iframe restrictions, or use 'Upload Image Form (OCR)' below to import your chalan."
        );
      } else if (errStr.includes("NotAllowedError") || errStr.includes("Permission denied")) {
        setErrorMessage(
          "Camera permission was denied. Please check your browser's site settings to unlock physical camera stream access, then try again."
        );
      } else {
        setErrorMessage(`Could not start the camera: ${errStr}. Please retry, or upload/paste your QR link.`);
      }
      setIsScanning(false);
      if (onScanError) onScanError(errStr);
    }
  };

  const stopScan = async () => {
    if (qrRef.current) {
      try {
        if (qrRef.current.isScanning) {
          await qrRef.current.stop();
        }
      } catch (err) {
        console.error("Error stopping camera scan:", err);
      }
    }
    setIsScanning(false);
  };

  // Enumerate cameras on boot
  useEffect(() => {
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (devices && devices.length > 0) {
          setCameras(devices);
          // Prefer back camera if available (usually contains "back" or "rear")
          const backCam = devices.find(
            (d) => d.label.toLowerCase().includes("back") || d.label.toLowerCase().includes("rear")
          );
          const defaultCamId = backCam ? backCam.id : devices[0].id;
          setSelectedCameraId(defaultCamId);
        } else {
          setErrorMessage("No system cameras detected.");
        }
      })
      .catch((err) => {
        console.warn("Could not retrieve camera device lists:", err);
        // Fallback to environment facingMode option direct triggers
      });

    return () => {
      if (qrRef.current && qrRef.current.isScanning) {
        qrRef.current.stop().catch((e) => console.log("Unmount stop failure ignored", e));
      }
    };
  }, []);

  // Handle switching camera source dynamically
  const handleCameraChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedCameraId(newId);
    if (isScanning) {
      startScan(newId);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
      <div className="w-full flex justify-between items-center mb-4">
        <h3 className="font-sans font-semibold text-slate-800 text-sm flex items-center gap-2">
          <Camera className="w-4 h-4 text-indigo-600 animate-pulse" />
          Live QR Code Scanner
        </h3>
        {cameras.length > 1 && (
          <div className="flex items-center gap-2">
            <label htmlFor="camera-select" className="text-xs text-slate-500 font-medium">Camera:</label>
            <select
              id="camera-select"
              className="text-xs select select-bordered border-slate-200 bg-slate-50 rounded-lg p-1 text-slate-700 outline-none focus:border-indigo-500"
              value={selectedCameraId}
              onChange={handleCameraChange}
            >
              {cameras.map((camera) => (
                <option key={camera.id} value={camera.id}>
                  {camera.label || `Camera ${camera.id.slice(0, 5)}...`}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Viewport Frame */}
      <div className="relative w-full aspect-square md:aspect-video rounded-xl overflow-hidden bg-slate-900 flex flex-col items-center justify-center border-2 border-dashed border-slate-200">
        <div id={scannerId} className="absolute inset-0 w-full h-full object-cover [&>video]:object-cover" />

        {/* Overlay scanning viewfinder cues */}
        {!isScanning ? (
          <div className="z-10 flex flex-col items-center gap-3 text-center p-4">
            <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
              <CameraOff className="w-6 h-6" />
            </div>
            <p className="text-xs text-slate-400 max-w-xs font-sans">
              Camera is currently idling. Position printed A-Chalan QR within camera view.
            </p>
            <button
              id="start-camera-scan-btn"
              onClick={() => startScan(selectedCameraId)}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:transform active:scale-95 transition text-white text-xs font-semibold rounded-lg shadow-md shadow-indigo-150 flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Start Live Camera
            </button>
          </div>
        ) : (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
            {/* Viewfinder crosshairs corners */}
            <div className="absolute w-[180px] h-[180px] border-2 border-indigo-500/80 rounded-lg shadow-[0_0_0_9999px_rgba(15,23,42,0.6)] flex items-center justify-center">
              <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-indigo-400 rounded-tl" />
              <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-indigo-400 rounded-tr" />
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-indigo-400 rounded-bl" />
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-indigo-400 rounded-br" />
              {/* Animated laser line */}
              <div className="w-full h-0.5 bg-indigo-400/80 animate-bounce shadow-md shadow-indigo-500" />
            </div>
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-slate-900/90 text-white text-[10px] font-medium tracking-wide font-sans py-1 px-3 rounded-full flex items-center gap-1.5 backdrop-blur-sm">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
              SCANNING IN PROGRESS...
            </div>
          </div>
        )}
      </div>

      {isScanning && (
        <button
          id="stop-camera-scan-btn"
          onClick={stopScan}
          className="mt-4 px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 transition text-xs font-semibold rounded-lg flex items-center gap-1.5"
        >
          Stop Camera
        </button>
      )}

      {errorMessage && (
        <div className="mt-4 w-full p-3 bg-red-50 rounded-xl flex items-start gap-2 text-xs text-red-700 animate-fade-in border border-red-100">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p>{errorMessage}</p>
        </div>
      )}
    </div>
  );
}
