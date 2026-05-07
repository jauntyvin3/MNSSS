
export interface FeeStructure {
  admissionFee: number;
  tuitionFee: number;
}

export const BASE_FEE_CONFIG: FeeStructure = {
  admissionFee: 13000,
  tuitionFee: 160000,
};

export type PaymentMode = 'Cash' | 'Cheque' | 'UPI' | 'Bank Transfer' | 'DD' | 'Card' | 'Net Banking' | 'Other';

export interface PaymentDetails {
  id?: string;
  studentId?: string;
  studentName?: string;
  mode: PaymentMode;
  transactionId?: string;
  bankName?: string;
  chequeNo?: string;
  date: string;
  amount: number;
  receiptNo: string;
}

export interface StudentRecord {
  id: string; // MNSSS-2026-0001
  srNo: string;
  rollNo: string;
  applicationNo: string;
  studentName: string;
  fatherName: string;
  className: string;
  village: string;
  admissionNo: string;
  mobileNo: string;
  emailId: string;
  allocatedSchool: string;
  category: string;
  allocatedCategory: string;
  domicile: string;
  domicileDistrict?: string;
  totalMarks: string;
  admissionStatus: string;
  medicalCenter: string;
  medicalStatus: string;
  docVerification: string;
  feesStatus: string;
  withdrawnDate?: string;
  withdrawnReason?: string;
  refundAmount?: number;
  
  // Documents (URLs or Base64)
  photoUrl?: string;
  adharCardUrl?: string;
  parentPhotoUrl?: string;
  marksheetUrl?: string;
  domicileCertUrl?: string;
  casteCertUrl?: string;
  otherIdUrl?: string;

  // Discount Flags
  isOneTimePayment: boolean;
  isArmyBackground: boolean;
  isSibling: boolean;
  managementDiscountPercent: number;

  // Custom Fees
  admissionFee?: number;
  tuitionFee?: number;

  // Financials
  payments: PaymentDetails[];
}

// Helper to calculate total discount percentage
export const calculateDiscountInfo = (student: Partial<StudentRecord>) => {
  let percent = 0;
  if (student.isOneTimePayment) percent += 10;
  if (student.isArmyBackground) percent += 5;
  if (student.isSibling) percent += 5;
  percent += Number(student.managementDiscountPercent || 0);
  
  if (percent > 100) percent = 100;
  
  const baseAdmissionFee = student.admissionFee !== undefined ? student.admissionFee : BASE_FEE_CONFIG.admissionFee;
  const baseTuitionFee = student.tuitionFee !== undefined ? student.tuitionFee : BASE_FEE_CONFIG.tuitionFee;

  const discountAmount = (baseTuitionFee * percent) / 100;
  let finalTuition = baseTuitionFee - discountAmount;
  if (finalTuition < 0) finalTuition = 0;
  
  let finalPayable = finalTuition + baseAdmissionFee;
  if (finalPayable < 0) finalPayable = 0;
  
  return {
    percent,
    discountAmount,
    finalTuition,
    baseTuitionFee,
    baseAdmissionFee,
    finalPayable
  };
};
