import React, { useState, useEffect } from "react";
import { ChalanRecord } from "../types";
import { Check, Edit2, CheckCircle2, AlertTriangle, FileText, Ban, Printer } from "lucide-react";

interface ChalanVisualizerProps {
  initialData: Omit<ChalanRecord, "id" | "scannedAt">;
  onConfirm: (finalData: Omit<ChalanRecord, "id" | "scannedAt">) => void;
  onCancel: () => void;
}

export default function ChalanVisualizer({ initialData, onConfirm, onCancel }: ChalanVisualizerProps) {
  const [data, setData] = useState<Omit<ChalanRecord, "id" | "scannedAt">>({ ...initialData });
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setData({ ...initialData });
  }, [initialData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setData((prev) => ({
      ...prev,
      [name]: name === "amount" ? parseFloat(value) || 0 : value,
    }));
  };

  const handleSaveEdit = () => {
    setIsEditing(false);
  };

  const handleConfirm = () => {
    onConfirm(data);
  };

  const convertAmountToWords = (num: number): string => {
    // Basic BDT currency words converter helper
    if (!num || isNaN(num)) return "Zero Taka Only";
    const units = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
    
    const formatLessThanThousand = (val: number): string => {
      let str = "";
      if (val >= 100) {
        str += units[Math.floor(val / 100)] + " Hundred ";
        val %= 100;
      }
      if (val >= 20) {
        str += tens[Math.floor(val / 10)] + " ";
        val %= 10;
      }
      if (val > 0) {
        str += units[val] + " ";
      }
      return str.trim();
    };

    let wordStr = "";
    let temp = num;

    const crore = Math.floor(temp / 10000000);
    temp %= 10000000;
    if (crore > 0) wordStr += formatLessThanThousand(crore) + " Crore ";

    const lakh = Math.floor(temp / 100000);
    temp %= 100000;
    if (lakh > 0) wordStr += formatLessThanThousand(lakh) + " Lakh ";

    const thousand = Math.floor(temp / 1000);
    temp %= 1000;
    if (thousand > 0) wordStr += formatLessThanThousand(thousand) + " Thousand ";

    if (temp > 0) wordStr += formatLessThanThousand(temp);

    return (wordStr.trim() ? wordStr.trim() + " Taka Only" : "Zero Taka Only");
  };

  return (
    <div className="w-full flex flex-col lg:flex-row gap-6 p-4 md:p-6 bg-slate-50 border border-slate-100 rounded-3xl animate-fade-in shadow-sm">
      
      {/* LEFT: Live Interactive Form Editor */}
      <div className="flex-1 shrink-0 p-5 md:p-6 bg-white rounded-2xl border border-slate-200/60 shadow-sm flex flex-col gap-4">
        <div className="flex justify-between items-center pb-3 border-b border-slate-100">
          <div>
            <span className="text-xs text-indigo-600 font-bold tracking-widest uppercase">Audit Control Panel</span>
            <h3 className="font-sans font-extrabold text-slate-800 text-lg">Verification Audit</h3>
          </div>
          <button
            id="toggle-edit-layout-btn"
            onClick={() => setIsEditing(!isEditing)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition duration-150 flex items-center gap-1.5 ${
              isEditing 
                ? "bg-slate-800 text-white border-transparent" 
                : "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
            }`}
          >
            <Edit2 className="w-3.5 h-3.5" />
            {isEditing ? "Viewing Receipt" : "Edit Parsed Fields"}
          </button>
        </div>

        {/* Form Inputs Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans">
          
          <div>
            <label htmlFor="chalanNo" className="block text-slate-500 font-medium mb-1">A-Chalan Number</label>
            <input
              id="chalanNo"
              type="text"
              name="chalanNo"
              disabled={!isEditing}
              value={data.chalanNo}
              onChange={handleChange}
              className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 disabled:bg-slate-50/50 disabled:text-slate-600 font-mono focus:border-indigo-500 outline-none transition"
            />
          </div>

          <div>
            <label htmlFor="chalanDate" className="block text-slate-500 font-medium mb-1">Chalan Date</label>
            <input
              id="chalanDate"
              type="text"
              name="chalanDate"
              disabled={!isEditing}
              value={data.chalanDate}
              onChange={handleChange}
              className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 disabled:bg-slate-50/50 disabled:text-slate-600 focus:border-indigo-500 outline-none transition"
            />
          </div>

          <div>
            <label htmlFor="amount" className="block text-slate-500 font-medium mb-1">Chalan Amount (BDT)</label>
            <input
              id="amount"
              type="number"
              name="amount"
              disabled={!isEditing}
              value={data.amount}
              onChange={handleChange}
              className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 disabled:bg-slate-50/50 disabled:text-slate-800 font-semibold focus:border-indigo-500 outline-none transition"
            />
          </div>

          <div>
            <label htmlFor="name" className="block text-slate-500 font-medium mb-1">Depositor Name</label>
            <input
              id="name"
              type="text"
              name="name"
              disabled={!isEditing}
              value={data.name}
              onChange={handleChange}
              className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 disabled:bg-slate-50/50 disabled:text-slate-800 font-medium focus:border-indigo-500 outline-none transition"
            />
          </div>

          <div>
            <label htmlFor="bankName" className="block text-slate-500 font-medium mb-1">Bank Name</label>
            <input
              id="bankName"
              type="text"
              name="bankName"
              disabled={!isEditing}
              value={data.bankName}
              onChange={handleChange}
              className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 disabled:bg-slate-50/50 disabled:text-slate-600 focus:border-indigo-500 outline-none transition"
            />
          </div>

          <div>
            <label htmlFor="branchName" className="block text-slate-500 font-medium mb-1">Branch Name</label>
            <input
              id="branchName"
              type="text"
              name="branchName"
              disabled={!isEditing}
              value={data.branchName || ""}
              onChange={handleChange}
              className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 disabled:bg-slate-50/50 disabled:text-slate-600 focus:border-indigo-500 outline-none transition"
            />
          </div>

          <div>
            <label htmlFor="district" className="block text-slate-500 font-medium mb-1">District</label>
            <input
              id="district"
              type="text"
              name="district"
              disabled={!isEditing}
              value={data.district || ""}
              onChange={handleChange}
              className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 disabled:bg-slate-50/50 disabled:text-slate-600 focus:border-indigo-500 outline-none transition"
            />
          </div>

          <div>
            <label htmlFor="economicCode" className="block text-slate-500 font-medium mb-1">Economic Treasury Code</label>
            <input
              id="economicCode"
              type="text"
              name="economicCode"
              disabled={!isEditing}
              value={data.economicCode || ""}
              onChange={handleChange}
              placeholder="e.g. 1-1133-0000-0311"
              className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 disabled:bg-slate-50/50 disabled:text-slate-600 font-mono focus:border-indigo-500 outline-none transition"
            />
          </div>

          <div className="md:col-span-2">
            <label htmlFor="verificationStatus" className="block text-slate-500 font-medium mb-1">Verification Status</label>
            <select
              id="verificationStatus"
              name="verificationStatus"
              disabled={!isEditing}
              value={data.verificationStatus}
              onChange={handleChange}
              className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 disabled:bg-slate-50/50 disabled:text-slate-600 font-sans focus:border-indigo-500 outline-none transition"
            >
              <option value="Verified">Verified</option>
              <option value="Verification Pending">Verification Pending</option>
              <option value="Invalid/Unverified">Invalid/Unverified</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="notes" className="block text-slate-500 font-medium mb-1">Auditor Review Notes</label>
            <textarea
              id="notes"
              name="notes"
              disabled={!isEditing}
              value={data.notes || ""}
              onChange={handleChange}
              rows={2}
              className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 disabled:bg-slate-50/50 disabled:text-slate-600 font-sans focus:border-indigo-500 outline-none transition resize-none"
              placeholder="Add verification notes, receipt discrepancies, or comments."
            />
          </div>
        </div>

        {/* Verification Alert Flag block */}
        <div className={`p-3.5 rounded-xl border flex gap-3 text-xs ${
          data.verificationStatus === "Verified" 
            ? "bg-emerald-50/80 border-emerald-100 text-emerald-800"
            : data.verificationStatus === "Verification Pending"
            ? "bg-amber-50/80 border-amber-100 text-amber-800"
            : "bg-rose-50/80 border-rose-100 text-rose-800"
        }`}>
          {data.verificationStatus === "Verified" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          )}
          <div>
            <p className="font-bold">Audit Method: {data.verificationSource}</p>
            <p className="font-sans mt-0.5 mt-1 text-slate-600">
              {data.verificationStatus === "Verified" 
                ? "This transaction has passed government checks or AI OCR signature verification. Excellent structural validity."
                : "Live verification holds. The physical record data is captured but requires corresponding treasury ledger validation."
              }
            </p>
          </div>
        </div>

        {/* Audit Confirmations Buttons */}
        <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-slate-100">
          <button
            id="cancel-chalan-audit-btn"
            onClick={onCancel}
            className="px-4 py-2.5 border border-slate-200 hover:bg-slate-50 active:transform active:scale-95 transition text-slate-600 text-xs font-semibold rounded-lg flex items-center gap-1.5"
          >
            <Ban className="w-3.5 h-3.5" /> Discard
          </button>
          <button
            id="confirm-chalan-audit-btn"
            onClick={handleConfirm}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:transform active:scale-95 text-white shadow-lg shadow-indigo-100 transition text-xs font-semibold rounded-lg flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" /> Confirm & Save to Registry
          </button>
        </div>

      </div>

      {/* RIGHT: High-Fidelity Treasury Form Copy (Simulated A-Chalan Form No. TR-6) */}
      <div className="w-full lg:w-[460px] max-w-lg p-6 md:p-8 bg-amber-50/20 border-2 border-slate-300 rounded-2xl bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] bg-[size:16px_16px] shadow-sm flex flex-col gap-6 font-serif relative overflow-hidden select-none">
        
        {/* Subtle printed watermark background */}
        <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none rotate-12 scale-150">
          <FileText className="w-64 h-64 text-slate-900" />
        </div>

        {/* Slip Header */}
        <div className="text-center font-serif flex flex-col items-center border-b border-double border-slate-400 pb-4">
          <div className="border border-slate-400 px-2 py-0.5 text-[8px] uppercase tracking-wide text-slate-500 mb-2">
            Bangladesh Form No. TR-6 (Rules 92, 107)
          </div>
          <h4 className="text-[11px] font-bold text-slate-800 tracking-wider">AUTOMATED CHALAN (চালান কপি)</h4>
          <p className="text-[9px] text-slate-500 mt-1 uppercase italic font-sans font-medium">Government of the People's Republic of Bangladesh</p>
          <p className="text-[9px] text-emerald-800 mt-0.5 font-bold font-sans">TREASURY COPIES (মন্ত্রণালয় কপি)</p>
        </div>

        {/* Core details table grid */}
        <div className="flex flex-col gap-3 font-serif text-[11px] text-slate-800">
          
          <div className="flex justify-between items-center py-1.5 border-b border-slate-300/70">
            <span className="text-slate-500 font-sans text-[9px] uppercase tracking-wider">Chalan Number / চালান নং:</span>
            <span className="font-mono font-bold tracking-wider text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-[10px]">{data.chalanNo || "T-XX-XXXX-XXXXX"}</span>
          </div>

          <div className="flex justify-between items-center py-1.5 border-b border-slate-300/70">
            <span className="text-slate-500 font-sans text-[9px] uppercase tracking-wider">Receipt Date / তারিখ:</span>
            <span className="font-medium text-slate-900">{data.chalanDate || "DD/MM/YYYY"}</span>
          </div>

          <div className="flex flex-col gap-1 py-1.5 border-b border-slate-300/70">
            <span className="text-slate-500 font-sans text-[9px] uppercase tracking-wider">Depositor Name & Details / জমাদানকারীর বিবরণ:</span>
            <span className="font-bold text-slate-900 capitalize text-justify">{data.name || "N/A"}</span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 py-1.5 border-b border-slate-300/70">
            <div className="flex flex-col">
              <span className="text-slate-500 font-sans text-[9px] uppercase tracking-wider">Bank / ব্যাংক:</span>
              <span className="font-bold text-slate-900 mt-0.5">{data.bankName || "Sonali Bank PLC"}</span>
            </div>
            <div className="flex flex-col border-l border-slate-200 pl-2">
              <span className="text-slate-500 font-sans text-[9px] uppercase tracking-wider">Branch / শাখা:</span>
              <span className="font-bold text-slate-900 mt-0.5">{data.branchName || "Ramna"} {data.district ? `, ${data.district}` : ""}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1 py-1.5 border-b border-slate-300/70">
            <span className="text-slate-500 font-sans text-[9px] uppercase tracking-wider">Economic Classification Code / কোড:</span>
            <span className="font-mono font-bold tracking-widest text-[#a855f7] bg-purple-50 border border-purple-100 px-2 py-0.5 rounded text-left self-start text-[10px]">
              {data.economicCode || "1-1133-0000-0311"}
            </span>
          </div>

          <div className="flex justify-between items-center py-2.5 border-b-2 border-double border-slate-400 bg-emerald-50/20 px-1 rounded">
            <span className="text-slate-600 font-bold font-sans text-[10px] uppercase tracking-wider text-emerald-800">Verified Amount (BDT) / টাকা:</span>
            <span className="font-mono font-extrabold text-emerald-700 text-sm">৳ {data.amount ? data.amount.toLocaleString("en-US", { minimumFractionDigits: 2 }) : "0.00"}</span>
          </div>

          <div className="flex flex-col gap-0.5 py-1 bg-slate-50 border border-slate-100 rounded px-2.5">
            <span className="text-slate-400 font-sans text-[8px] uppercase tracking-wider">Amount in Words / কথায়:</span>
            <span className="font-sans font-medium text-[10px] text-slate-600 italic">{convertAmountToWords(data.amount)}</span>
          </div>

        </div>

        {/* Paper Footer with simulated stamps */}
        <div className="mt-auto pt-6 flex justify-between items-end border-t border-dashed border-slate-300">
          <div className="flex flex-col items-center">
            <div className="w-[45px] h-[45px] rounded-full border-2 border-dashed border-emerald-600/60 flex items-center justify-center -rotate-12 mb-1">
              <div className="text-[8px] text-emerald-600/80 font-bold font-sans tracking-tight text-center leading-none">
                TREASURY<br />PASSED
              </div>
            </div>
            <span className="text-[7px] uppercase font-sans tracking-wider text-slate-400">Government Stamp</span>
          </div>

          <div className="flex flex-col items-end gap-1 font-serif text-[8px] text-slate-400 italic">
            <div className="border-b border-slate-400 w-24 h-5"></div>
            <span>Authorized Signature</span>
          </div>
        </div>

        {/* Barcode representation */}
        <div className="flex flex-col items-center mt-2 pt-1 border-t border-slate-200">
          <div className="w-full h-8 bg-[repeating-linear-gradient(90deg,#1e293b,#1e293b_3px,#f8fafc_3px,#f8fafc_6px)] opacity-80" />
          <span className="font-mono text-[7px] text-slate-400 mt-1 tracking-widest">{data.chalanNo || "0000000000"}</span>
        </div>

      </div>

    </div>
  );
}
