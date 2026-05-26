export interface ChalanRecord {
  id: string;
  chalanNo: string;
  chalanDate: string;
  amount: number;
  name: string;
  bankName: string;
  branchName: string;
  district?: string;
  economicCode?: string;
  verificationStatus: "Verified" | "Verification Pending" | "Invalid/Unverified";
  verificationSource: string;
  notes?: string;
  scannedAt: string;
}

export interface VerificationResponse {
  success: boolean;
  data?: Omit<ChalanRecord, "id" | "scannedAt">;
  error?: string;
}
