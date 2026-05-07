import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Search, Users, IndianRupee, FileText, School, Plus, X, 
  CreditCard, Smartphone, Building2, Wallet, Printer, Download,
  CheckCircle2, History, ChevronRight, LayoutDashboard, Database,
  Settings, LogOut, LogIn, Upload, Image as ImageIcon, FileCheck,
  Edit, Trash2, Mail, BellRing, IdCard, FileSpreadsheet, FileOutput
} from 'lucide-react';
import { 
  onSnapshot, collection, addDoc, updateDoc, doc, 
  query, orderBy, setDoc, getDocs, deleteDoc 
} from 'firebase/firestore';
import { 
  onAuthStateChanged, signOut 
} from 'firebase/auth';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line 
} from 'recharts';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { db, auth, signInWithGoogle } from './firebase.ts';
import { StudentRecord, BASE_FEE_CONFIG, PaymentDetails, PaymentMode, calculateDiscountInfo } from './types.ts';
import { indiaStatesAndDistricts } from './indiaMapping.ts';

type Tab = 'dashboard' | 'students' | 'reports' | 'payments';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<Tab>('students');
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [payments, setPayments] = useState<PaymentDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [toastMessage, setToastMessage] = useState<{title: string, desc: string} | null>(null);
  const showToast = (title: string, desc: string = '') => {
    setToastMessage({ title, desc });
    setTimeout(() => setToastMessage(null), 4000);
  };
  
  const [logoUrl, setLogoUrl] = useState<string>(localStorage.getItem('mnsss_logo') || 'https://cdn-icons-png.flaticon.com/512/1156/1156947.png');
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setLogoUrl(base64);
        localStorage.setItem('mnsss_logo', base64);
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsLoading(false);
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!user) return;
    
    const studentsQuery = query(collection(db, 'students'), orderBy('studentName', 'asc'));
    const unsubStudents = onSnapshot(studentsQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data() } as StudentRecord));
      setStudents(data);
    });

    const paymentsQuery = query(collection(db, 'payments'), orderBy('date', 'desc'));
    const unsubPayments = onSnapshot(paymentsQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentDetails));
      setPayments(data);
    });

    return () => {
      unsubStudents();
      unsubPayments();
    };
  }, [user]);

  const [searchTerm, setSearchTerm] = useState('');
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<StudentRecord | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<PaymentDetails | null>(null);
  const [viewingIdStudent, setViewingIdStudent] = useState<StudentRecord | null>(null);
  const [viewingProfileStudent, setViewingProfileStudent] = useState<StudentRecord | null>(null);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [withdrawForm, setWithdrawForm] = useState({ reason: '', refundAmount: 0 });
  const [isReportPrintModalOpen, setIsReportPrintModalOpen] = useState(false);
  
  const receiptRef = useRef<HTMLDivElement>(null);

  // Enrollment Form State
  const [enrollForm, setEnrollForm] = useState({
    srNo: '',
    rollNo: '',
    applicationNo: '',
    studentName: '',
    fatherName: '',
    className: '',
    village: '',
    mobileNo: '',
    emailId: '',
    allocatedSchool: 'Maninagendra Singh Sainik School',
    category: '',
    allocatedCategory: '',
    domicile: '',
    domicileDistrict: '',
    totalMarks: '',
    admissionStatus: 'Confirmed',
    medicalCenter: '',
    medicalStatus: 'Fit',
    docVerification: 'Pending',
    feesStatus: 'Pending',
    isOneTimePayment: false,
    isArmyBackground: false,
    isSibling: false,
    managementDiscountPercent: 0,
    admissionFee: BASE_FEE_CONFIG.admissionFee,
    tuitionFee: BASE_FEE_CONFIG.tuitionFee,
    photoUrl: '',
    adharCardUrl: '',
    parentPhotoUrl: '',
    marksheetUrl: '',
    domicileCertUrl: '',
    casteCertUrl: '',
    otherIdUrl: ''
  } as any);

  // ID & Receipt Generators
  const nextStudentId = useMemo(() => {
    const nextNum = (students.length + 1).toString().padStart(4, '0');
    return `MNSSS-SR-2026-${nextNum}`;
  }, [students]);

  const nextReceiptNo = useMemo(() => {
    const nextNum = (payments.length + 1).toString().padStart(4, '0');
    return `MNSSS-SR-2026-${nextNum}`;
  }, [payments]);

  // Payment Form State
  const [paymentForm, setPaymentForm] = useState({
    mode: 'UPI' as PaymentMode,
    amount: 0,
    transactionId: '',
    bankName: '',
    chequeNo: '',
    otherMode: ''
  });

  const filteredStudents = useMemo(() => {
    return students.filter(s => 
      s.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.admissionNo.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [students, searchTerm]);

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewingProfileStudent) return;
    
    try {
      const studentRef = doc(db, 'students', viewingProfileStudent.id);
      await updateDoc(studentRef, {
        admissionStatus: 'Withdrawn',
        withdrawnDate: new Date().toISOString(),
        withdrawnReason: withdrawForm.reason,
        refundAmount: withdrawForm.refundAmount
      });
      setIsWithdrawModalOpen(false);
      setViewingProfileStudent(null);
      showToast('Student Withdrawn', `Cadet ${viewingProfileStudent.studentName} has been withdrawn.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `students/${viewingProfileStudent.id}`);
    }
  };

  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    const newStudent: StudentRecord = {
      ...enrollForm,
      id: enrollForm.id || nextStudentId,
      payments: enrollForm.payments || []
    };
    
    try {
      await setDoc(doc(db, 'students', newStudent.id), newStudent);
      setIsEnrollModalOpen(false);
      showToast('Cadet Enrolled Successfully', `ID: ${newStudent.id}`);
      setEnrollForm({
        srNo: '', rollNo: '', applicationNo: '', studentName: '', fatherName: '', className: '', village: '',
        mobileNo: '', emailId: '', allocatedSchool: 'Maninagendra Singh Sainik School', category: '', allocatedCategory: '',
        domicile: '', domicileDistrict: '', totalMarks: '', admissionStatus: 'Confirmed', medicalCenter: '', medicalStatus: 'Fit',
        docVerification: 'Pending', feesStatus: 'Pending', isOneTimePayment: false, isArmyBackground: false, isSibling: false,
        managementDiscountPercent: 0, admissionFee: BASE_FEE_CONFIG.admissionFee, tuitionFee: BASE_FEE_CONFIG.tuitionFee, photoUrl: '', adharCardUrl: '', parentPhotoUrl: '', marksheetUrl: '',
        domicileCertUrl: '', casteCertUrl: '', otherIdUrl: ''
      } as any);
    } catch (error) {
      console.error("Error saving student:", error);
      showToast('Operation Failed', 'Check your connection or permissions.');
    }
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;

    const receiptNo = editingPaymentId ? (paymentForm as any).receiptNo : nextReceiptNo;

    const paymentData: PaymentDetails = {
      receiptNo,
      date: editingPaymentId && (paymentForm as any).date ? (paymentForm as any).date : new Date().toISOString(),
      amount: paymentForm.amount,
      mode: paymentForm.mode === 'Other' ? (paymentForm.otherMode as any) : paymentForm.mode,
      transactionId: paymentForm.transactionId,
      bankName: paymentForm.bankName,
      chequeNo: paymentForm.chequeNo
    };

    try {
      if (editingPaymentId) {
        await updateDoc(doc(db, 'payments', editingPaymentId), paymentData as any);
        const updatedPayments = selectedStudent.payments.map(p => p.receiptNo === receiptNo ? { ...p, ...paymentData } : p);
        await updateDoc(doc(db, 'students', selectedStudent.id), { payments: updatedPayments });
        showToast('Payment Updated', `Receipt ${receiptNo} updated.`);
      } else {
        await addDoc(collection(db, 'payments'), { ...paymentData, studentId: selectedStudent.id, studentName: selectedStudent.studentName });
        await updateDoc(doc(db, 'students', selectedStudent.id), {
          payments: [...selectedStudent.payments, paymentData]
        });
        showToast('Payment Successful', `Receipt ${paymentData.receiptNo} generated.`);
      }

      setEditingPaymentId(null);
      setIsPaymentModalOpen(false);
      resetPaymentForm();
    } catch (error) {
      console.error("Error saving payment:", error);
      showToast('Operation Failed', 'Check your connection or permissions.');
    }
  };

  const handleEditPayment = (payment: PaymentDetails & { id?: string, studentId?: string }) => {
    if (!payment.id || !payment.studentId) return;
    const student = students.find(s => s.id === payment.studentId);
    if (!student) return;
    
    setSelectedStudent(student);
    setEditingPaymentId(payment.id);
    setPaymentForm({
      mode: payment.mode,
      amount: payment.amount,
      transactionId: payment.transactionId || '',
      bankName: payment.bankName || '',
      chequeNo: payment.chequeNo || '',
      otherMode: '',
      ...payment
    } as any);
    setIsPaymentModalOpen(true);
  };

  const handleDeleteStudent = async (studentId: string) => {
    if (window.confirm('Are you sure you want to delete this cadet? This action cannot be undone.')) {
      try {
        await deleteDoc(doc(db, 'students', studentId));
        // Note: we can also query and delete payments, but let's keep it simple
        showToast('Cadet Deleted', `ID: ${studentId} removed.`);
      } catch (error) { showToast('Operation Failed', 'Could not delete.'); }
    }
  };

  const handleDeletePayment = async (paymentId: string, studentId: string, receiptNo: string) => {
    if (window.confirm('Are you sure you want to delete this payment record?')) {
      try {
        await deleteDoc(doc(db, 'payments', paymentId));
        const student = students.find(s => s.id === studentId);
        if (student) {
          const updatedPayments = student.payments.filter(p => p.receiptNo !== receiptNo);
          await updateDoc(doc(db, 'students', studentId), { payments: updatedPayments });
        }
        showToast('Payment Deleted', `Receipt ${receiptNo} removed.`);
        if (viewingReceipt?.receiptNo === receiptNo) setViewingReceipt(null);
      } catch (error) { showToast('Operation Failed', 'Could not delete.'); }
    }
  };

  const resetPaymentForm = () => {
    setPaymentForm({
      mode: 'UPI',
      amount: 0,
      transactionId: '',
      bankName: '',
      chequeNo: '',
      otherMode: ''
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  const handleMobileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    const digits = input.replace(/\D/g, '');
    
    let tenDigits = digits;
    if (digits.startsWith('91') && digits.length > 2) {
      tenDigits = digits.substring(2);
    }
    
    tenDigits = tenDigits.substring(0, 10);
    
    if (tenDigits.length === 0) {
      setEnrollForm({...enrollForm, mobileNo: ''});
      return;
    }
    
    let formatted = '+91 ';
    if (tenDigits.length > 5) {
      formatted += tenDigits.substring(0, 5) + ' ' + tenDigits.substring(5);
    } else {
      formatted += tenDigits;
    }
    
    setEnrollForm({...enrollForm, mobileNo: formatted});
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEnrollForm(prev => ({ ...prev, [field]: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  if (!user && !isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white p-12 rounded-[3rem] shadow-2xl max-w-md w-full text-center space-y-8">
          <div className="w-24 h-24 bg-blue-900 rounded-[2.5rem] flex items-center justify-center text-white text-4xl font-black mx-auto shadow-2xl shadow-blue-900/20 overflow-hidden">
            {localStorage.getItem('mnsss_logo') ? <img src={localStorage.getItem('mnsss_logo')!} alt="Logo" className="w-full h-full object-cover bg-white" /> : "MS"}
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">MNSSS Management Login</h2>
            <p className="text-slate-500 mt-2 font-medium">Access institutional fee records and cadet data.</p>
          </div>
          <button 
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 bg-blue-900 text-white py-4 rounded-2xl font-bold hover:bg-blue-800 transition-all active:scale-95 shadow-xl shadow-blue-900/10"
          >
            <LogIn className="w-5 h-5" /> Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-900 border-t-transparent rounded-full" />
      </div>
    );
  }

  const renderDashboard = () => {
    const totalCollection = payments.reduce((acc, p) => acc + p.amount, 0);
    const totalFee = students.reduce((acc, s) => acc + calculateDiscountInfo(s).finalPayable, 0);
    const balanceFee = totalFee - totalCollection;
    
    const modeData = Object.entries(
      payments.reduce((acc: any, p) => {
        acc[p.mode] = (acc[p.mode] || 0) + p.amount;
        return acc;
      }, {})
    ).map(([name, value]) => ({ name, value }));

    const classData = Object.entries(
      students.reduce((acc: any, s) => {
        acc[s.className] = (acc[s.className] || 0) + 1;
        return acc;
      }, {})
    ).map(([name, value]) => ({ name, value }));

    const COLORS = ['#1e3a8a', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777'];

    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-900"><Users className="w-6 h-6" /></div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Cadets</p>
                <p className="text-2xl font-black text-slate-900">{students.length}</p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600"><FileText className="w-6 h-6" /></div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Fee Amount</p>
                <p className="text-2xl font-black text-slate-900">{formatCurrency(totalFee)}</p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600"><IndianRupee className="w-6 h-6" /></div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Collected</p>
                <p className="text-2xl font-black text-slate-900">{formatCurrency(totalCollection)}</p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600"><CheckCircle2 className="w-6 h-6" /></div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Balance Fee</p>
                <p className="text-2xl font-black text-slate-900">{formatCurrency(balanceFee)}</p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm shadow-slate-200/50">
            <h3 className="text-lg font-black text-slate-900 mb-8 flex items-center gap-3">
               <div className="w-2 h-2 rounded-full bg-blue-900" /> Collection by Mode
            </h3>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={modeData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} />
                  <YAxis hide />
                  <Tooltip 
                    contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    cursor={{ fill: '#f8fafc' }}
                  />
                <Bar dataKey="value" fill="#1e3a8a" radius={[10, 10, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm shadow-slate-200/50">
          <h3 className="text-lg font-black text-slate-900 mb-8 flex items-center gap-3">
             <div className="w-2 h-2 rounded-full bg-emerald-500" /> Cadets per Class
          </h3>
          <div className="h-80 w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={classData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {classData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      </div>
    );
  };

  const renderPaymentsTab = () => {
    return (
      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
           <div>
             <h3 className="text-xl font-black text-slate-900">Payment Transactions</h3>
             <p className="text-sm text-slate-500 font-medium italic">All institutional receipts chronologically ordered</p>
           </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-[0.2em]">
                <th className="px-8 py-5" style={{ color: '#ffffff' }}>Date & Time</th>
                <th className="px-8 py-5">Receipt No</th>
                <th className="px-8 py-5">Cadet Name</th>
                <th className="px-8 py-5">Mode</th>
                <th className="px-8 py-5">Amount</th>
                <th className="px-8 py-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm font-medium text-slate-600">
              {payments.map((p) => (
                <tr key={p.id || p.receiptNo} className="hover:bg-slate-50 transition-colors">
                  <td className="px-8 py-5 text-xs font-bold text-slate-500">{new Date(p.date).toLocaleString()}</td>
                  <td className="px-8 py-5 font-black text-slate-900">{p.receiptNo}</td>
                  <td className="px-8 py-5 font-bold">{p.studentName || 'Unknown'}</td>
                  <td className="px-8 py-5 text-xs">
                    <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full font-bold uppercase">{p.mode}</span>
                  </td>
                  <td className="px-8 py-5 text-emerald-600 font-black">{formatCurrency(p.amount)}</td>
                  <td className="px-8 py-5 text-right flex items-center justify-end gap-2">
                    <button onClick={() => setViewingReceipt(p)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors" title="View/Print">
                       <Printer className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleEditPayment(p)} className="p-2 text-purple-600 hover:bg-purple-50 rounded-xl transition-colors" title="Edit">
                       <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDeletePayment(p.id!, p.studentId!, p.receiptNo)} className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors" title="Delete">
                       <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr><td colSpan={6} className="px-8 py-10 text-center text-slate-400 font-bold">No transactions found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const getReportData = () => {
    return students.map((s, idx) => {
      const info = calculateDiscountInfo(s);
      const paid = s.payments.reduce((acc, p) => acc + p.amount, 0);
      const lastPay = s.payments[s.payments.length - 1];
      
      return {
        'Sr. No': idx + 1,
        'Cadet Name': s.studentName,
        'ID': s.id,
        'Class': s.className,
        'Total Paid': paid,
        'Balance': info.finalPayable - paid,
        'Last Transaction': lastPay ? lastPay.date : '---',
      };
    });
  };

  const exportToExcel = () => {
    const data = getReportData();
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reports");
    XLSX.writeFile(workbook, "MNSSS_Reports.xlsx");
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    const data = getReportData();
    const tableColumn = Object.keys(data[0] || {});
    // @ts-ignore
    const tableRows = data.map(obj => Object.values(obj));
    
    doc.setFontSize(18);
    doc.text("MNSSS Financial Reports", 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
    
    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 35,
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 138] } // blue-900
    });
    doc.save("MNSSS_Reports.pdf");
  };

  const renderReports = () => {
    return (
      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-50/50 gap-4">
           <div>
             <h3 className="text-xl font-black text-slate-900">Financial Reports</h3>
             <p className="text-sm text-slate-500 font-medium italic">Comprehensive institutional audit data</p>
           </div>
           <div className="flex flex-wrap items-center gap-3">
             <button onClick={exportToExcel} className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all active:scale-95 shadow-lg shadow-emerald-600/20">
                <FileSpreadsheet className="w-4 h-4" /> EXCEL
             </button>
             <button onClick={exportToPDF} className="flex items-center gap-2 bg-red-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-red-700 transition-all active:scale-95 shadow-lg shadow-red-600/20">
                <FileOutput className="w-4 h-4" /> PDF
             </button>
             <button onClick={() => setIsReportPrintModalOpen(true)} className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-900/20">
                <Printer className="w-4 h-4" /> PRINT
             </button>
           </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-[0.2em]">
                <th className="px-8 py-5" style={{ color: '#ffffff' }}>Sr. No</th>
                <th className="px-8 py-5">Cadet Name</th>
                <th className="px-8 py-5">ID</th>
                <th className="px-8 py-5">Class</th>
                <th className="px-8 py-5">Total Paid</th>
                <th className="px-8 py-5">Balance</th>
                <th className="px-8 py-5">Last Transaction</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm font-medium text-slate-600">
              {students.map((s, idx) => {
                const info = calculateDiscountInfo(s);
                const paid = s.payments.reduce((acc, p) => acc + p.amount, 0);
                const lastPay = s.payments[s.payments.length - 1];
                
                return (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-8 py-5 font-bold text-slate-400">{idx + 1}</td>
                    <td className="px-8 py-5 font-black text-slate-900">{s.studentName}</td>
                    <td className="px-8 py-5 font-mono text-xs">{s.id}</td>
                    <td className="px-8 py-5">{s.className}</td>
                    <td className="px-8 py-5 text-emerald-600 font-bold">{formatCurrency(paid)}</td>
                    <td className="px-8 py-5 text-amber-600 font-bold">{formatCurrency(info.finalPayable - paid)}</td>
                    <td className="px-8 py-5 text-xs text-slate-400">{lastPay ? lastPay.date : '---'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-900 font-sans print:bg-white text-base">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-8 right-8 z-[100] bg-slate-900 text-white p-4 rounded-2xl shadow-2xl flex items-start gap-4 animate-in fade-in slide-in-from-top-4 duration-300 min-w-80">
          <div className="w-8 h-8 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h4 className="font-bold text-sm tracking-tight">{toastMessage.title}</h4>
            {toastMessage.desc && <p className="text-xs text-slate-400 mt-1">{toastMessage.desc}</p>}
          </div>
          <button onClick={() => setToastMessage(null)} className="text-slate-500 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header - Hidden in Print */}
      <header className="flex items-center justify-between px-8 py-6 bg-white border-b border-slate-200 print:hidden relative z-20">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-4 group cursor-pointer relative">
            <label htmlFor="logo-upload" className="w-12 h-12 bg-blue-900 rounded-lg flex items-center justify-center text-white font-bold text-xl transition-all group-hover:scale-110 overflow-hidden shadow-inner cursor-pointer" title="Click to upload logo">
               <img src={logoUrl} alt="Logo" className="w-full h-full object-cover bg-white" />
            </label>
            <input type="file" id="logo-upload" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            <div>
              <h1 className="text-xl font-bold tracking-tight text-blue-900 uppercase leading-none">Maninagendra Singh Sainik School</h1>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mt-1">Institutional Mgmt Suite v2.1</p>
            </div>
          </div>

          <nav className="hidden lg:flex items-center gap-2 bg-slate-100 p-1 rounded-2xl ml-8">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'dashboard' ? 'bg-white text-blue-900 shadow-lg shadow-black/5' : 'text-slate-500 hover:text-slate-900'}`}
            >
              <LayoutDashboard className="w-4 h-4" /> Dashboard
            </button>
            <button 
              onClick={() => setActiveTab('students')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'students' ? 'bg-white text-blue-900 shadow-lg shadow-black/5' : 'text-slate-500 hover:text-slate-900'}`}
            >
              <Users className="w-4 h-4" /> Cadets
            </button>
            <button 
              onClick={() => setActiveTab('payments')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'payments' ? 'bg-white text-blue-900 shadow-lg shadow-black/5' : 'text-slate-500 hover:text-slate-900'}`}
            >
              <IndianRupee className="w-4 h-4" /> Payments
            </button>
            <button 
              onClick={() => setActiveTab('reports')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'reports' ? 'bg-white text-blue-900 shadow-lg shadow-black/5' : 'text-slate-500 hover:text-slate-900'}`}
            >
              <Database className="w-4 h-4" /> Reports
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-3 pr-6 border-r border-slate-200">
            <div className="text-right">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Session Admin</p>
              <p className="text-xs font-bold text-slate-900">{user?.displayName || user?.email}</p>
            </div>
            {user?.photoURL ? (
              <img src={user.photoURL} className="w-9 h-9 rounded-full ring-2 ring-blue-900/10" alt="Admin" />
            ) : (
              <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-xs uppercase">
                {user?.email?.charAt(0)}
              </div>
            )}
            <button onClick={() => signOut(auth)} className="ml-2 p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all" title="Logout">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
          <button 
            onClick={() => setIsEnrollModalOpen(true)}
            className="flex items-center gap-2 bg-blue-900 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-800 transition-all shadow-xl shadow-blue-900/20 active:scale-95"
          >
            <Plus className="w-4 h-4" /> Enrollment
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8 flex flex-col gap-8 print:hidden">
        {activeTab === 'dashboard' && renderDashboard()}
        
        {activeTab === 'reports' && renderReports()}
        {activeTab === 'payments' && renderPaymentsTab()}

        {activeTab === 'students' && (
          <>
            {/* Search & Actions */}
            <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm gap-4 animate-in fade-in duration-500">
              <div className="relative w-full sm:w-96">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text"
                  placeholder="Universal search: Name, ID, Roll..."
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all text-sm font-medium"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-8">
                <div className="text-right">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Pool</p>
                   <p className="text-xl font-black text-blue-900 tracking-tighter">{students.length} <span className="text-[10px] text-slate-300 font-bold">Cadets</span></p>
                </div>
                <div className="w-12 h-12 bg-blue-900 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-900/20">
                  <Database className="w-6 h-6" />
                </div>
              </div>
            </div>

            {/* Student List */}
            <div className="grid grid-cols-1 gap-6">
              {filteredStudents.length > 0 ? (
                filteredStudents.map(student => {
                  const info = calculateDiscountInfo(student);
                  const paidAmount = student.payments.reduce((acc, p) => acc + p.amount, 0);
                  const isFullyPaid = paidAmount >= info.finalPayable;
                  
                  return (
                    <div key={student.id} className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group relative animate-in fade-in zoom-in-95 duration-500">
                      <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-blue-900 text-white rounded-xl flex items-center justify-center text-xs font-black shadow-xl shadow-blue-900/30 z-10">
                        {students.length - students.indexOf(student)}
                      </div>
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 pl-6">
                        <div className="flex gap-6">
                          <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center overflow-hidden border border-slate-200 shadow-inner group-hover:border-blue-400 transition-colors">
                            {student.photoUrl ? (
                              <img src={student.photoUrl} className="w-full h-full object-cover" alt={student.studentName} />
                            ) : (
                              <Users className="w-10 h-10 text-slate-300" />
                            )}
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-3">
                              <h3 className="text-xl font-black text-slate-900 tracking-tight">{student.studentName}</h3>
                              <span className="text-[10px] bg-blue-900 text-white px-3 py-1 rounded-full font-black uppercase tracking-widest">{student.id}</span>
                              {student.admissionStatus === 'Withdrawn' && (
                                <span className="text-[10px] bg-red-100 text-red-600 px-3 py-1 rounded-full font-black uppercase tracking-widest border border-red-200">Withdrawn</span>
                              )}
                            </div>
                            <p className="text-sm text-slate-500 font-bold tracking-tight">Class {student.className} • ROLL: <span className="text-slate-900">{student.rollNo}</span> • APP: <span className="text-slate-900">{student.applicationNo}</span></p>
                            <div className="flex gap-4 mt-3">
                               <div className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${student.medicalStatus === 'Fit' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-amber-50 border-amber-200 text-amber-600'}`}>
                                  {student.medicalStatus === 'Fit' ? <CheckCircle2 className="w-3 h-3" /> : <Settings className="w-3 h-3" />} Medical: {student.medicalStatus}
                               </div>
                               <div className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${student.docVerification === 'Verified' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                                  <FileCheck className="w-3 h-3" /> Docs: {student.docVerification}
                               </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-6 px-4 bg-slate-50/50 p-6 rounded-3xl border border-slate-100 italic transition-all group-hover:bg-blue-50/50 group-hover:border-blue-100">
                          <div>
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-none mb-2">Liability</p>
                            <p className="text-base font-black text-slate-900 tracking-tighter leading-none">{formatCurrency(info.finalPayable)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-none mb-2">Deposited</p>
                            <p className={`text-base font-black tracking-tighter leading-none ${isFullyPaid ? 'text-emerald-600' : 'text-blue-900'}`}>{formatCurrency(paidAmount)}</p>
                          </div>
                          <div className="hidden lg:block">
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-none mb-2">Concession</p>
                            <p className="text-base font-black text-slate-900 tracking-tighter leading-none">{info.percent}%</p>
                          </div>
                          <div className="hidden lg:block text-right">
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-none mb-2">Standing</p>
                            {isFullyPaid ? (
                              <span className="text-[10px] bg-emerald-600 text-white px-3 py-1 rounded-lg font-black uppercase tracking-widest italic shadow-lg shadow-emerald-600/20">CLEARance</span>
                            ) : (
                              <span className="text-[10px] bg-amber-500 text-white px-3 py-1 rounded-lg font-black uppercase tracking-widest italic shadow-lg shadow-amber-500/20">{(info.finalPayable - paidAmount) / info.finalPayable > 0.5 ? 'CRITICAL-DUE' : 'DUE'}</span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 w-full md:w-auto shrink-0">
                          <button 
                            onClick={() => {
                              setSelectedStudent(student);
                              setIsPaymentModalOpen(true);
                            }}
                            disabled={student.admissionStatus === 'Withdrawn'}
                            className={`w-full px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 active:scale-95 italic ${
                              student.admissionStatus === 'Withdrawn' 
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                                : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xl shadow-emerald-600/10'
                            }`}
                          >
                            <IndianRupee className="w-4 h-4" /> Collect
                          </button>
                          <div className="flex items-center gap-2">
                            <button onClick={() => setViewingProfileStudent(student)} className="flex-1 bg-slate-100 text-blue-600 p-3 rounded-xl hover:bg-blue-100 flex justify-center transition-colors" title="View Profile">
                              <Users className="w-4 h-4" />
                            </button>
                            <button onClick={() => setViewingIdStudent(student)} className="flex-1 bg-slate-100 text-purple-600 p-3 rounded-xl hover:bg-purple-100 flex justify-center transition-colors" title="ID Card">
                              <IdCard className="w-4 h-4" />
                            </button>
                            <button onClick={() => {
                                const remaining = info.finalPayable - paidAmount;
                                if(remaining > 0) showToast('Email Sent', `Fee reminder of ${formatCurrency(remaining)} sent to ${student.emailId || 'cadet'}`);
                              }} className="flex-1 bg-slate-100 text-slate-500 p-3 rounded-xl hover:bg-slate-200 flex justify-center transition-colors" title="Fee Reminder">
                              <BellRing className="w-4 h-4" />
                            </button>
                            <button onClick={() => { setEnrollForm(student as any); setIsEnrollModalOpen(true); }} className="flex-1 bg-slate-100 text-slate-500 p-3 rounded-xl hover:bg-slate-200 flex justify-center transition-colors" title="Edit Cadet">
                              <Edit className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDeleteStudent(student.id)} className="flex-1 bg-slate-100 text-red-500 p-3 rounded-xl hover:bg-red-100 flex justify-center transition-colors" title="Delete Cadet">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                      
                      {student.payments.length > 0 && (
                        <div className="mt-8 pt-6 border-t border-slate-100 flex items-center gap-6 overflow-x-auto text-[10px] no-scrollbar">
                          <span className="font-black uppercase tracking-widest text-slate-400 flex items-center gap-2 shrink-0">
                             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Audit Trail:
                          </span>
                          {student.payments.map((p, idx) => (
                            <button 
                              key={idx} 
                              onClick={() => setViewingReceipt(p)}
                              className="bg-slate-50 border border-slate-100 px-4 py-2 rounded-xl text-slate-500 font-black uppercase tracking-widest hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50/50 transition-all flex items-center gap-2 whitespace-nowrap shadow-sm active:scale-95 italic"
                            >
                              <FileText className="w-3 h-3" /> {p.receiptNo} • {formatCurrency(p.amount)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="bg-white border border-dashed border-slate-200 rounded-[3rem] p-32 text-center flex flex-col items-center justify-center animate-in zoom-in-95 duration-500 shadow-inner">
                  <div className="w-24 h-24 bg-slate-50 rounded-[2rem] flex items-center justify-center mb-8 shadow-inner border border-slate-100">
                    <Database className="w-12 h-12 text-slate-200" />
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">System Ready. No Entry.</h3>
                  <p className="text-slate-500 mt-3 max-w-sm font-medium">The institutional database is currently empty for the 2026 session. Start by enrolling a new cadet using the button above.</p>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Enrollment Modal */}
      {isEnrollModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md overflow-hidden">
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300 max-h-[90vh] flex flex-col">
            <div className="bg-blue-900 p-8 text-white flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-2xl font-bold">New Cadet Enrollment</h2>
                <p className="text-blue-200 text-sm font-medium uppercase tracking-widest mt-1">Session 2026-2027</p>
              </div>
              <button 
                onClick={() => setIsEnrollModalOpen(false)}
                className="bg-white/10 p-2 rounded-full hover:bg-white/20 transition-all active:scale-90"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleEnroll} className="p-8 overflow-y-auto custom-scrollbar space-y-8">
              <div className="flex flex-col md:flex-row items-center gap-6 bg-blue-50 p-6 rounded-2xl border border-blue-100 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-900 rounded-lg flex items-center justify-center text-white">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-blue-900/50 uppercase tracking-widest">Automatic Pilot ID</p>
                    <p className="text-xl font-black text-blue-900 tracking-tighter leading-none">{enrollForm.id || nextStudentId}</p>
                  </div>
                </div>
                <div className="flex-1 grid grid-cols-2 gap-4 w-full">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-blue-900/40 uppercase tracking-widest">Application No</label>
                    <input  className="w-full bg-white/50 border border-blue-100 px-3 py-2 rounded-lg text-sm font-bold outline-none focus:bg-white transition-all" 
                      value={enrollForm.applicationNo} onChange={e => setEnrollForm({...enrollForm, applicationNo: e.target.value})} placeholder="APP2026..." />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-blue-900/40 uppercase tracking-widest">Roll No</label>
                    <input  className="w-full bg-white/50 border border-blue-100 px-3 py-2 rounded-lg text-sm font-bold outline-none focus:bg-white transition-all" 
                      value={enrollForm.rollNo} onChange={e => setEnrollForm({...enrollForm, rollNo: e.target.value})} placeholder="ROLL-###" />
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-600" /> Mandatory Identity Vault
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                   <div className="space-y-2">
                     <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Cadet Photo</label>
                     <div className="relative group">
                       <input type="file" accept="image/*" className="hidden" id="photo" onChange={e => handleFileUpload(e, 'photoUrl')} />
                       <label htmlFor="photo" className="w-full bg-slate-50 border-2 border-dashed border-slate-200 h-32 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-blue-400 transition-all overflow-hidden">
                          {enrollForm.photoUrl ? <img src={enrollForm.photoUrl} className="w-full h-full object-cover" /> : <ImageIcon className="w-6 h-6 text-slate-300" />}
                          <span className="text-[8px] font-black uppercase text-slate-400">Upload Photo</span>
                       </label>
                     </div>
                   </div>
                   <div className="space-y-2">
                     <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Aadhar Card</label>
                     <div className="relative">
                       <input type="file" accept="image/*" className="hidden" id="adhar" onChange={e => handleFileUpload(e, 'adharCardUrl')} />
                       <label htmlFor="adhar" className="w-full bg-slate-50 border-2 border-dashed border-slate-200 h-32 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-blue-400 transition-all overflow-hidden">
                          {enrollForm.adharCardUrl ? <div className="bg-blue-900 w-full h-full flex items-center justify-center text-white"><FileText /></div> : <Upload className="w-6 h-6 text-slate-300" />}
                          <span className="text-[8px] font-black uppercase text-slate-400">Scan Aadhar</span>
                       </label>
                     </div>
                   </div>
                   <div className="space-y-2">
                     <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Parent Group Photo</label>
                     <div className="relative">
                       <input type="file" accept="image/*" className="hidden" id="parent" onChange={e => handleFileUpload(e, 'parentPhotoUrl')} />
                       <label htmlFor="parent" className="w-full bg-slate-50 border-2 border-dashed border-slate-200 h-32 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-blue-400 transition-all overflow-hidden">
                          {enrollForm.parentPhotoUrl ? <img src={enrollForm.parentPhotoUrl} className="w-full h-full object-cover" /> : <Users className="w-6 h-6 text-slate-300" />}
                          <span className="text-[8px] font-black uppercase text-slate-400">With Parents</span>
                       </label>
                     </div>
                   </div>
                   <div className="space-y-2 text-center flex flex-col">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-3">Other Documents</label>
                      <div className="flex gap-2 flex-1">
                         <input type="file" accept="image/*" className="hidden" id="marksheet" onChange={e => handleFileUpload(e, 'marksheetUrl')} />
                         <label htmlFor="marksheet" className={`flex-1 rounded-xl border flex items-center justify-center ${enrollForm.marksheetUrl ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-slate-50 border-slate-200 text-slate-400'}`} title="Marksheet">
                            <FileText className="w-5 h-5" />
                         </label>
                         <input type="file" accept="image/*" className="hidden" id="domicileCert" onChange={e => handleFileUpload(e, 'domicileCertUrl')} />
                         <label htmlFor="domicileCert" className={`flex-1 rounded-xl border flex items-center justify-center ${enrollForm.domicileCertUrl ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-slate-50 border-slate-200 text-slate-400'}`} title="Domicile">
                            <School className="w-5 h-5" />
                         </label>
                         <input type="file" accept="image/*" className="hidden" id="casteCert" onChange={e => handleFileUpload(e, 'casteCertUrl')} />
                         <label htmlFor="casteCert" className={`flex-1 rounded-xl border flex items-center justify-center ${enrollForm.casteCertUrl ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-slate-50 border-slate-200 text-slate-400'}`} title="Caste">
                            <Database className="w-5 h-5" />
                         </label>
                         <input type="file" accept="image/*" className="hidden" id="otherId" onChange={e => handleFileUpload(e, 'otherIdUrl')} />
                         <label htmlFor="otherId" className={`flex-1 rounded-xl border flex items-center justify-center ${enrollForm.otherIdUrl ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-slate-50 border-slate-200 text-slate-400'}`} title="Other ID">
                            <CreditCard className="w-5 h-5" />
                         </label>
                      </div>
                   </div>
                </div>
              </div>

              <div className="space-y-6">
                <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-600" /> Basic Information
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Student Name</label>
                    <input  className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold transition-all" 
                      value={enrollForm.studentName} onChange={e => setEnrollForm({...enrollForm, studentName: e.target.value})} placeholder="Full name of cadet" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Father's Name</label>
                    <input  className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold transition-all"
                      value={enrollForm.fatherName} onChange={e => setEnrollForm({...enrollForm, fatherName: e.target.value})} placeholder="Parent/Guardian Name" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Mobile No</label>
                    <input  className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold"
                      value={enrollForm.mobileNo} onChange={handleMobileChange} placeholder="+91 XXXXX XXXXX" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Email ID</label>
                    <input type="email"  className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold"
                      value={enrollForm.emailId} onChange={e => setEnrollForm({...enrollForm, emailId: e.target.value})} placeholder="cadet@example.com" />
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-600" /> Academic & Allocation
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Class</label>
                    <select className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold transition-all"
                      value={enrollForm.className} onChange={e => setEnrollForm({...enrollForm, className: e.target.value})}>
                      <option value="">Select Class</option>
                      {['6th', '7th', '8th', '9th', '10th', '11th', '12th'].map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Total Marks</label>
                    <input  className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold transition-all"
                      value={enrollForm.totalMarks} onChange={e => setEnrollForm({...enrollForm, totalMarks: e.target.value})} placeholder="Scored Marks" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Allocated School</label>
                    <input readOnly disabled className="w-full bg-slate-100 border border-slate-200 px-4 py-3 rounded-xl text-sm font-bold text-slate-500"
                      value={enrollForm.allocatedSchool} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Domicile State</label>
                    <select className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold transition-all"
                      value={enrollForm.domicile} onChange={e => setEnrollForm({...enrollForm, domicile: e.target.value, domicileDistrict: ''})}>
                      <option value="">Select State</option>
                      {Object.keys(indiaStatesAndDistricts).sort().map(state => (
                        <option key={state} value={state}>{state}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Domicile District</label>
                    <select className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold transition-all disabled:opacity-50"
                      value={enrollForm.domicileDistrict || ''} onChange={e => setEnrollForm({...enrollForm, domicileDistrict: e.target.value})} disabled={!enrollForm.domicile}>
                      <option value="">Select District</option>
                      {enrollForm.domicile && indiaStatesAndDistricts[enrollForm.domicile] ? (
                        indiaStatesAndDistricts[enrollForm.domicile].sort().map(dist => (
                          <option key={dist} value={dist}>{dist}</option>
                        ))
                      ) : null}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Candidate Category</label>
                    <select className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold transition-all"
                      value={enrollForm.category} onChange={e => setEnrollForm({...enrollForm, category: e.target.value})}>
                      <option value="">Select Category</option>
                      <option value="General">General</option>
                      <option value="OBC- NCL (Central List)">OBC- NCL (Central List)</option>
                      <option value="SC">SC</option>
                      <option value="ST">ST</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Allocated Category</label>
                    <select className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold transition-all"
                      value={enrollForm.allocatedCategory} onChange={e => setEnrollForm({...enrollForm, allocatedCategory: e.target.value})}>
                      <option value="">Select Allocated Route</option>
                      <option value="40% Route Un-Reserve">40% Route Un-Reserve</option>
                      <option value="40% Route OBC">40% Route OBC</option>
                      <option value="40% Route SC">40% Route SC</option>
                      <option value="40% Route ST">40% Route ST</option>
                      <option value="40% Route DEF">40% Route DEF</option>
                      <option value="60% Route Un-Reserve">60% Route Un-Reserve</option>
                      <option value="60% Route OBC">60% Route OBC</option>
                      <option value="60% Route SC">60% Route SC</option>
                      <option value="60% Route ST">60% Route ST</option>
                      <option value="60% Route DEF">60% Route DEF</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-600" /> Medical & Verification
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Medical Center</label>
                    <input  className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold transition-all"
                      value={enrollForm.medicalCenter} onChange={e => setEnrollForm({...enrollForm, medicalCenter: e.target.value})} placeholder="Hospital/Center" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Medical Status</label>
                    <select className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold appearance-none"
                      value={enrollForm.medicalStatus} onChange={e => setEnrollForm({...enrollForm, medicalStatus: e.target.value})}>
                      <option value="Fit">Fit</option>
                      <option value="Unfit">Unfit</option>
                      <option value="Remedial">Remedial</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Doc Verification</label>
                    <select className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold appearance-none"
                      value={enrollForm.docVerification} onChange={e => setEnrollForm({...enrollForm, docVerification: e.target.value})}>
                      <option value="Verified">Verified</option>
                      <option value="Pending">Pending</option>
                      <option value="Rejected">Rejected</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-200 space-y-6">
                <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2">
                   <div className="w-1.5 h-1.5 rounded-full bg-blue-600" /> Fee Setup
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Admission/Registration Fee</label>
                    <input type="number" className="w-full bg-white border border-slate-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold transition-all"
                      value={enrollForm.admissionFee} onChange={e => setEnrollForm({...enrollForm, admissionFee: Number(e.target.value)})} placeholder="E.g. 13000" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Tuition Fee</label>
                    <input type="number" className="w-full bg-white border border-slate-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold transition-all"
                      value={enrollForm.tuitionFee} onChange={e => setEnrollForm({...enrollForm, tuitionFee: Number(e.target.value)})} placeholder="E.g. 160000" />
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-200 space-y-6">
                <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2">
                   <div className="w-1.5 h-1.5 rounded-full bg-blue-600" /> Discount Matrix (Tuition-Only)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <label className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-slate-200 cursor-pointer hover:border-blue-300 transition-all shadow-sm">
                    <input type="checkbox" className="w-5 h-5 text-blue-600 rounded-lg border-slate-300 transition-all focus:ring-offset-2 focus:ring-blue-500 cursor-pointer" 
                      checked={enrollForm.isOneTimePayment} onChange={e => setEnrollForm({...enrollForm, isOneTimePayment: e.target.checked})} />
                    <span className="text-sm font-bold text-slate-700">One-Time (10%)</span>
                  </label>
                  <label className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-slate-200 cursor-pointer hover:border-blue-300 transition-all shadow-sm">
                    <input type="checkbox" className="w-5 h-5 text-blue-600 rounded-lg border-slate-300 transition-all focus:ring-offset-2 focus:ring-blue-500 cursor-pointer" 
                      checked={enrollForm.isArmyBackground} onChange={e => setEnrollForm({...enrollForm, isArmyBackground: e.target.checked})} />
                    <span className="text-sm font-bold text-slate-700">Army Background (5%)</span>
                  </label>
                  <label className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-slate-200 cursor-pointer hover:border-blue-300 transition-all shadow-sm">
                    <input type="checkbox" className="w-5 h-5 text-blue-600 rounded-lg border-slate-300 transition-all focus:ring-offset-2 focus:ring-blue-500 cursor-pointer" 
                      checked={enrollForm.isSibling} onChange={e => setEnrollForm({...enrollForm, isSibling: e.target.checked})} />
                    <span className="text-sm font-bold text-slate-700">Sibling Discount (5%)</span>
                  </label>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Custom Management Grant (%)</label>
                  <input type="number" className="w-full bg-white border border-slate-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold"
                    value={enrollForm.managementDiscountPercent || ''} placeholder="0"
                    onChange={e => setEnrollForm({...enrollForm, managementDiscountPercent: Number(e.target.value)})} />
                </div>
              </div>

              <div className="bg-blue-900 p-8 rounded-[2rem] text-white flex flex-col sm:flex-row justify-between items-center gap-6 shadow-2xl shadow-blue-900/20">
                <div className="text-center sm:text-left">
                  <p className="text-[10px] opacity-60 font-black uppercase tracking-widest">Final Session Amount</p>
                  <p className="text-3xl font-black tracking-tighter leading-none mt-1">{formatCurrency(calculateDiscountInfo(enrollForm).finalPayable)}</p>
                </div>
                <button type="submit" className="w-full sm:w-auto bg-white text-blue-900 px-10 py-4 rounded-2xl font-black text-sm uppercase hover:bg-blue-50 transition-all active:scale-95 shadow-xl shadow-black/10 tracking-widest">
                  Confirm Admission
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {isPaymentModalOpen && selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
           <div className="bg-white rounded-[2.5rem] w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            <div className="bg-emerald-600 p-8 text-white flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold">{editingPaymentId ? 'Edit Fee Payment' : 'Collect Fee Payment'}</h2>
                <p className="text-emerald-100 text-sm font-medium uppercase tracking-widest mt-1">Receipt ID: <span className="font-black text-white">{editingPaymentId ? (paymentForm as any).receiptNo : nextReceiptNo}</span></p>
              </div>
              <button 
                onClick={() => {
                  setEditingPaymentId(null);
                  setIsPaymentModalOpen(false);
                  resetPaymentForm();
                }}
                className="bg-white/10 p-2 rounded-full hover:bg-white/20 transition-all"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handlePayment} className="p-8 space-y-8">
              <div className="flex items-center gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-emerald-600 border border-slate-100 shadow-sm">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900 leading-none mb-1">{selectedStudent.studentName}</h4>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-tight italic">{selectedStudent.id}</p>
                </div>
              </div>

              <div className="space-y-6">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] block pl-1">Channel Select</label>
                <div className="grid grid-cols-4 gap-3">
                  {(['Cash', 'UPI', 'Bank Transfer', 'Cheque'] as PaymentMode[]).map(m => (
                    <button 
                      key={m}
                      type="button"
                      onClick={() => setPaymentForm({...paymentForm, mode: m})}
                      className={`py-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all active:scale-95 ${paymentForm.mode === m ? 'bg-emerald-50 border-emerald-600 text-emerald-700 shadow-lg shadow-emerald-600/10' : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-slate-200'}`}
                    >
                      {m === 'Cash' && <Wallet className="w-6 h-6" />}
                      {m === 'UPI' && <Smartphone className="w-6 h-6" />}
                      {m === 'Bank Transfer' && <Building2 className="w-6 h-6" />}
                      {m === 'Cheque' && <CreditCard className="w-6 h-6" />}
                      <span className="text-[10px] font-black uppercase tracking-tighter">{m}</span>
                    </button>
                  ))}
                </div>

                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Amount to Transfer (₹)</label>
                    <input  type="number" className="w-full bg-slate-50 border-2 border-slate-100 px-5 py-4 rounded-2xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none text-lg font-black transition-all"
                      value={paymentForm.amount || ''} placeholder="0"
                      onChange={e => setPaymentForm({...paymentForm, amount: Number(e.target.value)})} />
                  </div>
                  
                  {paymentForm.mode !== 'Cash' && (
                    <div className="space-y-4 animate-in slide-in-from-top-4 duration-300">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Transaction Ref / ID</label>
                        <input  className="w-full bg-slate-50 border border-slate-200 px-5 py-3 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm font-bold"
                          value={paymentForm.transactionId} placeholder="TXN-#### or Ref No"
                          onChange={e => setPaymentForm({...paymentForm, transactionId: e.target.value})} />
                      </div>
                      
                      {paymentForm.mode === 'Cheque' && (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Cheque No</label>
                            <input  className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm font-bold"
                              value={paymentForm.chequeNo} onChange={e => setPaymentForm({...paymentForm, chequeNo: e.target.value})} />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Bank Name</label>
                            <input  className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm font-bold"
                              value={paymentForm.bankName} onChange={e => setPaymentForm({...paymentForm, bankName: e.target.value})} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <button type="submit" className="w-full bg-emerald-600 text-white py-5 rounded-[2rem] font-black text-sm uppercase hover:bg-emerald-700 shadow-2xl shadow-emerald-600/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 tracking-[0.2em]">
                Execute Payment <CheckCircle2 className="w-6 h-6" />
              </button>
            </form>
          </div>
        </div>
      )}

      {isReportPrintModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md overflow-y-auto py-10 print:p-0 print:m-0 print:bg-white print:block">
          <div className="bg-white rounded-[2rem] w-full max-w-5xl shadow-2xl relative print:shadow-none print:rounded-none">
            <div className="absolute top-8 right-8 flex gap-3 print:hidden items-center">
              <button 
                onClick={() => window.print()}
                className="bg-slate-900 text-white p-3 rounded-xl hover:bg-slate-800 transition-all shadow-xl active:scale-95 font-bold flex items-center gap-2"
                title="Print Report"
              >
                <Printer className="w-5 h-5" /> PRINT
              </button>
              <button 
                onClick={() => setIsReportPrintModalOpen(false)}
                className="bg-slate-100 text-slate-500 p-3 rounded-xl hover:bg-slate-200 transition-all shadow-xl active:scale-90 font-black"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-12 print:p-6 print:m-0 font-sans" id="print-report-container">
              <div className="mb-8 border-b-2 border-slate-900 pb-6">
                <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase mb-2">Institutional Financial Report</h1>
                <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">{new Date().toLocaleString()}</p>
              </div>
              <table className="w-full text-left border border-slate-200 text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-900 text-xs font-black uppercase tracking-widest border-b border-slate-200">
                    <th className="p-3 border-r border-slate-200">Sr. No</th>
                    <th className="p-3 border-r border-slate-200">Cadet Name</th>
                    <th className="p-3 border-r border-slate-200">ID</th>
                    <th className="p-3 border-r border-slate-200">Class</th>
                    <th className="p-3 border-r border-slate-200">Total Paid</th>
                    <th className="p-3 border-r border-slate-200">Balance</th>
                    <th className="p-3">Last Transaction</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students.map((s, idx) => {
                    const info = calculateDiscountInfo(s);
                    const paid = s.payments.reduce((acc, p) => acc + p.amount, 0);
                    const lastPay = s.payments[s.payments.length - 1];
                    return (
                      <tr key={s.id} className="text-slate-700 font-medium">
                        <td className="p-3 border-r border-slate-100">{idx + 1}</td>
                        <td className="p-3 border-r border-slate-100 font-bold">{s.studentName}</td>
                        <td className="p-3 border-r border-slate-100 text-xs font-mono">{s.id}</td>
                        <td className="p-3 border-r border-slate-100">{s.className}</td>
                        <td className="p-3 border-r border-slate-100 font-bold">{formatCurrency(paid)}</td>
                        <td className="p-3 border-r border-slate-100 font-bold">{formatCurrency(info.finalPayable - paid)}</td>
                        <td className="p-3 text-xs">{lastPay ? lastPay.date : '---'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mt-8 text-right opacity-60 text-xs font-bold uppercase tracking-widest">
                <p>End of Report</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legacy Receipt Modal (viewingReceipt) */}
      {viewingReceipt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md overflow-y-auto py-10 print:p-0 print:m-0 print:bg-white">
          <div className="bg-white rounded-[3rem] w-full max-w-4xl shadow-2xl relative print:shadow-none print:rounded-none">
            <div className="absolute top-8 right-8 flex gap-3 print:hidden items-center">
              <button 
                onClick={handlePrint}
                className="bg-emerald-600 text-white px-4 py-2 rounded-xl hover:bg-emerald-700 transition-all shadow-xl active:scale-95 font-bold flex items-center gap-2"
              >
                <Download className="w-5 h-5" /> PDF
              </button>
              <button 
                onClick={handlePrint}
                className="bg-blue-600 text-white p-3 rounded-full hover:bg-blue-700 transition-all shadow-xl active:scale-90"
                title="Print Receipt"
              >
                <Printer className="w-6 h-6" />
              </button>
              <button 
                onClick={() => setViewingReceipt(null)}
                className="bg-slate-100 text-slate-500 p-3 rounded-full hover:bg-slate-200 transition-all shadow-xl active:scale-90 font-black"
                title="Close"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            {/* The Print Area */}
            <div ref={receiptRef} className="p-16 print:p-6 print:m-0 font-sans border-[12px] border-slate-50 print:border-0 rounded-[3rem] print:rounded-none">
              <div className="flex justify-between items-start border-b-4 border-blue-900 pb-10 mb-10">
                <div className="flex gap-8 items-center">
                  <div className="w-24 h-24 bg-blue-900 rounded-[2rem] flex items-center justify-center text-white font-black text-4xl shadow-2xl shadow-blue-900/20 overflow-hidden">
                    {logoUrl ? <img src={logoUrl} alt="Logo" className="w-full h-full object-cover bg-white" /> : "MS"}
                  </div>
                  <div>
                    <h1 className="text-4xl font-black text-blue-900 tracking-tighter leading-none mb-2">MANINAGENDRA SINGH SAINIK SCHOOL</h1>
                    <p className="text-sm font-black text-slate-400 uppercase tracking-[0.3em] mb-2 px-1">Institutional Fee Receipt • System MS-FIN-2026</p>
                    <div className="flex gap-4 text-[10px] font-bold text-slate-400 px-1 italic">
                      <span>Gotegaon, Madhya Pradesh, India</span>
                      <span>•</span>
                      <span>www.ms-sainikschool.edu</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-16 mb-12">
                <div className="space-y-6">
                  <h4 className="text-[11px] font-black text-blue-900 uppercase tracking-[0.3em] flex items-center gap-3">
                    <div className="w-2.5 h-0.5 bg-blue-900 rounded-full" /> Cadet Profile
                  </h4>
                  <div className="space-y-3 bg-slate-50 p-6 rounded-3xl border border-slate-100">
                    <div className="flex justify-between text-xs border-b border-slate-200 pb-2">
                       <span className="text-slate-400 font-bold">FULL NAME</span>
                       <span className="font-black text-slate-900">{students.find(s => s.payments.some(p => p.receiptNo === viewingReceipt.receiptNo))?.studentName}</span>
                    </div>
                    <div className="flex justify-between text-xs border-b border-slate-200 pb-2 pt-1">
                       <span className="text-slate-400 font-bold">OFFICIAL ID</span>
                       <span className="font-black text-blue-800 tracking-tighter">{students.find(s => s.payments.some(p => p.receiptNo === viewingReceipt.receiptNo))?.id}</span>
                    </div>
                    <div className="flex justify-between text-xs pt-1">
                       <span className="text-slate-400 font-bold">CLASS / ID</span>
                       <span className="font-black text-slate-900 uppercase">
                          {students.find(s => s.payments.some(p => p.receiptNo === viewingReceipt.receiptNo))?.className} • 
                          {students.find(s => s.payments.some(p => p.receiptNo === viewingReceipt.receiptNo))?.id}
                       </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <h4 className="text-[11px] font-black text-blue-900 uppercase tracking-[0.3em] flex items-center gap-3">
                    <div className="w-2.5 h-0.5 bg-blue-900 rounded-full" /> Payment Info
                  </h4>
                  <div className="space-y-3 bg-slate-50 p-6 rounded-3xl border border-slate-100">
                    <div className="flex justify-between text-xs border-b border-slate-200 pb-2">
                       <span className="text-slate-400 font-bold">RECEIPT NO</span>
                       <span className="font-black text-emerald-700">{viewingReceipt.receiptNo}</span>
                    </div>
                    <div className="flex justify-between text-xs border-b border-slate-200 pb-2 pt-1">
                       <span className="text-slate-400 font-bold">DATE & TIME</span>
                       <span className="font-bold text-slate-900 font-mono tracking-tighter uppercase">{viewingReceipt.date}</span>
                    </div>
                    <div className="flex justify-between text-xs pt-1">
                       <span className="text-slate-400 font-bold">MODE / CHANNEL</span>
                       <span className="font-black text-slate-900 uppercase">{viewingReceipt.mode}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Fee Matrix Receipt View */}
              <div className="bg-white rounded-[2rem] border-2 border-slate-100 overflow-hidden mb-12 shadow-sm">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-900 text-white text-[11px] font-black uppercase tracking-[0.2em]">
                      <th className="px-10 py-5">Fee Component Description</th>
                      <th className="px-10 py-5 text-right">Base Amount</th>
                      <th className="px-10 py-5 text-right">Adjustment</th>
                      <th className="px-10 py-5 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="text-[13px] font-bold text-slate-700 divide-y-2 divide-slate-50">
                    {(() => {
                      const receiptStudent = students.find(s => s.payments.some(p => p.receiptNo === viewingReceipt.receiptNo));
                      const dInfo = calculateDiscountInfo(receiptStudent || {});
                      return (
                        <>
                          <tr>
                            <td className="px-10 py-8">Initial Admission Registration Charges (Fixed)</td>
                            <td className="px-10 py-8 text-right font-mono">{formatCurrency(dInfo.baseAdmissionFee)}</td>
                            <td className="px-10 py-8 text-right text-slate-300">0.00</td>
                            <td className="px-10 py-8 text-right font-mono">{formatCurrency(dInfo.baseAdmissionFee)}</td>
                          </tr>
                          <tr>
                            <td className="px-10 py-8">
                              Educational Maintenance & Tuition (Session 2026)
                              {receiptStudent?.isArmyBackground && (
                                <div className="mt-2 mr-2 inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-[10px] uppercase font-black tracking-widest border border-blue-100">
                                   Armed Forces Grant Eligible
                                </div>
                              )}
                              {receiptStudent?.isSibling && (
                                <div className="mt-2 inline-flex items-center gap-2 bg-purple-50 text-purple-700 px-3 py-1 rounded-full text-[10px] uppercase font-black tracking-widest border border-purple-100">
                                   Sibling Grant Eligible
                                </div>
                              )}
                            </td>
                            <td className="px-10 py-8 text-right font-mono">{formatCurrency(dInfo.baseTuitionFee)}</td>
                            <td className="px-10 py-8 text-right text-red-500 font-mono">
                               -{dInfo.percent}%
                            </td>
                            <td className="px-10 py-8 text-right font-black text-slate-900 font-mono leading-none">
                               {formatCurrency(dInfo.finalTuition)}
                            </td>
                          </tr>
                        </>
                      );
                    })()}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-200">
                      <td colSpan={3} className="px-10 py-8 text-xs font-black text-slate-400 text-right uppercase tracking-[0.4em]">Current Amount Deposited</td>
                      <td className="px-10 py-8 text-right font-black text-blue-900 text-2xl tracking-tighter bg-blue-50/50">{formatCurrency(viewingReceipt.amount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="flex justify-between items-end gap-20">
                <div className="space-y-6">
                   {viewingReceipt.transactionId && (
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 inline-block">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Transaction Ref</p>
                        <p className="text-xs font-black text-slate-700 font-mono tracking-tight">{viewingReceipt.transactionId}</p>
                      </div>
                   )}
                   <div className="pt-2">
                     <div className="w-48 h-1 bg-slate-100 mb-6" />
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Institutional Seal</p>
                   </div>
                </div>
                <div className="text-right">
                   <div className="inline-block relative mb-4">
                     <p className="text-xs font-black text-slate-900 italic tracking-tighter transform -rotate-2">Auth Signature: MS-FIN/OFFICER</p>
                   </div>
                   <div className="w-56 h-1.5 bg-blue-900 ml-auto mb-4" />
                   <p className="text-[10px] font-black text-blue-900 uppercase tracking-[0.3em]">Accounting Department</p>
                </div>
              </div>

              <div className="mt-20 text-center border-t border-slate-100 pt-8">
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.4em] leading-loose max-w-2xl mx-auto italic">
                   This receipt validates payment for the academic year specified. All payments are subject to standard school terms. 
                   Computer generated - no physical signature  unless specifically requested by bank.
                 </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {viewingProfileStudent && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md overflow-y-auto py-10 print:p-0 print:m-0 print:bg-white">
          <div className="bg-white rounded-[3rem] w-full max-w-4xl shadow-2xl relative print:shadow-none print:rounded-none">
            <div className="absolute top-8 right-8 flex gap-3 print:hidden items-center">
              {viewingProfileStudent.admissionStatus !== 'Withdrawn' && (
                <button 
                  onClick={() => setIsWithdrawModalOpen(true)}
                  className="bg-red-50 text-red-600 px-4 py-2 rounded-xl hover:bg-red-100 transition-all font-bold tracking-widest text-xs uppercase"
                >
                  Withdraw
                </button>
              )}
              <button 
                onClick={handlePrint}
                className="bg-emerald-600 text-white px-4 py-2 rounded-xl hover:bg-emerald-700 transition-all shadow-xl active:scale-95 font-bold flex items-center gap-2"
              >
                <Download className="w-5 h-5" /> PDF
              </button>
              <button 
                onClick={handlePrint}
                className="bg-blue-600 text-white p-3 rounded-full hover:bg-blue-700 transition-all shadow-xl active:scale-90"
                title="Print Profile"
              >
                <Printer className="w-6 h-6" />
              </button>
              <button 
                onClick={() => setViewingProfileStudent(null)}
                className="bg-slate-100 text-slate-500 p-3 rounded-full hover:bg-slate-200 transition-all shadow-xl active:scale-90 font-black"
                title="Close"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-16 print:p-6 print:m-0 font-sans border-[12px] border-slate-50 print:border-0 rounded-[3rem] print:rounded-none">
              <div className="flex justify-between items-start border-b-4 border-blue-900 pb-10 mb-10">
                <div className="flex gap-8 items-center">
                  <div className="w-24 h-24 bg-blue-900 rounded-[2rem] flex items-center justify-center text-white font-black text-4xl shadow-2xl shadow-blue-900/20 overflow-hidden">
                    {logoUrl ? <img src={logoUrl} alt="Logo" className="w-full h-full object-cover bg-white" /> : "MS"}
                  </div>
                  <div>
                    <h1 className="text-4xl font-black text-blue-900 tracking-tighter leading-none mb-2">MANINAGENDRA SINGH SAINIK SCHOOL</h1>
                    <p className="text-sm font-black text-slate-400 uppercase tracking-[0.3em] mb-2 px-1">Cadet Profile Details</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-8 mb-10">
                <div className="w-48 h-48 bg-slate-100 rounded-3xl overflow-hidden border-4 border-slate-50 shadow-inner shrink-0">
                  {viewingProfileStudent.photoUrl ? (
                    <img src={viewingProfileStudent.photoUrl} alt="Student" className="w-full h-full object-cover" />
                  ) : (
                    <Users className="w-full h-full p-10 text-slate-300" />
                  )}
                </div>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center gap-4">
                      <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">{viewingProfileStudent.studentName}</h2>
                      {viewingProfileStudent.admissionStatus === 'Withdrawn' && (
                        <span className="bg-red-100 text-red-600 px-3 py-1 rounded-lg text-xs font-black tracking-widest uppercase">Withdrawn</span>
                      )}
                    </div>
                    <p className="text-base font-bold text-slate-500 uppercase tracking-widest mt-1">ID: {viewingProfileStudent.id}</p>
                    {viewingProfileStudent.admissionStatus === 'Withdrawn' && (
                        <div className="mt-2 bg-red-50 p-3 rounded-xl border border-red-100 text-sm">
                          <p><span className="font-bold text-red-900/60 uppercase text-[10px] tracking-widest">Reason:</span> <span className="text-red-900 font-medium">{viewingProfileStudent.withdrawnReason}</span></p>
                          <p><span className="font-bold text-red-900/60 uppercase text-[10px] tracking-widest">Refund Amount:</span> <span className="text-red-900 font-medium">{formatCurrency(viewingProfileStudent.refundAmount || 0)}</span></p>
                        </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Class</p>
                      <p className="font-bold text-lg">{viewingProfileStudent.className}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Roll No</p>
                      <p className="font-bold text-lg">{viewingProfileStudent.rollNo || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Application No</p>
                      <p className="font-bold text-lg">{viewingProfileStudent.applicationNo}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Father's Name</p>
                      <p className="font-bold text-lg">{viewingProfileStudent.fatherName}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Village/City</p>
                      <p className="font-bold text-lg">{viewingProfileStudent.village}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mobile No</p>
                      <p className="font-bold text-lg">{viewingProfileStudent.mobileNo}</p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10 border-t border-slate-100 pt-8">
                 <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2">Category / Route</p>
                    <p className="text-base font-black text-slate-900 tracking-tighter">{viewingProfileStudent.category} / {viewingProfileStudent.allocatedCategory}</p>
                 </div>
                 <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2">Domicile</p>
                    <p className="text-base font-black text-slate-900 tracking-tighter">{viewingProfileStudent.domicile || 'N/A'} {viewingProfileStudent.domicileDistrict ? `(${viewingProfileStudent.domicileDistrict})` : ''}</p>
                 </div>
                 <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2">Medical Status</p>
                    <p className="text-base font-black text-slate-900 tracking-tighter">{viewingProfileStudent.medicalStatus}</p>
                 </div>
                 <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2">Doc Verification</p>
                    <p className="text-base font-black text-slate-900 tracking-tighter">{viewingProfileStudent.docVerification}</p>
                 </div>
              </div>

              <div className="border-t-4 border-slate-50 pt-10 mt-10">
                <h3 className="font-black text-lg mb-6">Payment History</h3>
                {viewingProfileStudent.payments.length > 0 ? (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-[0.2em]">
                        <th className="px-6 py-4 rounded-tl-xl">Date</th>
                        <th className="px-6 py-4">Receipt No</th>
                        <th className="px-6 py-4">Mode</th>
                        <th className="px-6 py-4 rounded-tr-xl text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm font-medium">
                      {viewingProfileStudent.payments.map((p, idx) => (
                        <tr key={idx}>
                          <td className="px-6 py-4">{new Date(p.date).toLocaleDateString()}</td>
                          <td className="px-6 py-4 font-bold">{p.receiptNo}</td>
                          <td className="px-6 py-4">{p.mode}</td>
                          <td className="px-6 py-4 text-right">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(p.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-slate-500 font-bold italic border-2 border-dashed border-slate-200 p-8 rounded-2xl text-center">No payment history found.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {isWithdrawModalOpen && viewingProfileStudent && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
          <div className="bg-white rounded-[2rem] w-full max-w-sm p-8 shadow-2xl relative">
            <button onClick={() => setIsWithdrawModalOpen(false)} className="absolute top-4 right-4 p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-all"><X className="w-5 h-5"/></button>
            <h3 className="text-xl font-black text-slate-900 tracking-tight uppercase mb-6 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                <X className="w-4 h-4" />
              </span>
              Withdraw Cadet
            </h3>
            <form onSubmit={handleWithdraw} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Reason for Withdrawal</label>
                <textarea 
                  className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold min-h-[100px]"
                  value={withdrawForm.reason}
                  onChange={e => setWithdrawForm({...withdrawForm, reason: e.target.value})}
                  placeholder="Parent request, Relocation, etc."
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Refund Amount (INR)</label>
                <input 
                  type="number"
                  className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold"
                  value={withdrawForm.refundAmount}
                  onChange={e => setWithdrawForm({...withdrawForm, refundAmount: Number(e.target.value)})}
                  placeholder="0"
                />
              </div>
              <button 
                type="submit"
                className="w-full bg-red-600 text-white font-bold py-4 rounded-xl hover:bg-red-700 transition-all uppercase tracking-widest text-xs"
              >
                Confirm Withdrawal
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ID Card Modal */}
      {viewingIdStudent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-sm overflow-hidden shadow-2xl relative">
            <div className="absolute top-4 right-4 flex gap-2 z-10 print:hidden">
              <button onClick={() => window.print()} className="p-2 bg-white/20 backdrop-blur border border-white/40 text-black hover:bg-white/40 rounded-xl transition-all shadow-xl font-bold italic" title="Print ID Card">
                  <Printer className="w-4 h-4" />
              </button>
              <button onClick={() => setViewingIdStudent(null)} className="p-2 bg-white/20 backdrop-blur border border-white/40 text-black hover:bg-white/40 rounded-xl transition-all shadow-xl font-bold italic" title="Close">
                  <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-6 text-center select-none" id="id-card-print">
              <div className="flex flex-col items-center">
                 {/* Logo & Header */}
                 <div className="w-16 h-16 bg-blue-900 rounded-2xl flex items-center justify-center text-white font-bold mb-3 shadow-lg overflow-hidden">
                    {logoUrl ? <img src={logoUrl} alt="Logo" className="w-full h-full object-cover bg-white" /> : "MS"}
                 </div>
                 <h2 className="text-sm font-black text-blue-900 tracking-tight leading-none uppercase">Maninagendra Singh</h2>
                 <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Sainik School</h3>
                 
                 <div className="w-full h-1 bg-emerald-500 my-4 bg-[length:10px_10px] bg-stripes" />
                 
                 {/* Photo */}
                 <div className="w-32 h-32 bg-slate-100 rounded-3xl mx-auto mb-4 overflow-hidden border-4 border-slate-50 shadow-inner">
                   {viewingIdStudent.photoUrl ? (
                     <img src={viewingIdStudent.photoUrl} alt="Student" className="w-full h-full object-cover" />
                   ) : (
                     <Users className="w-full h-full p-6 text-slate-300" />
                   )}
                 </div>
                 
                 {/* Details */}
                 <h1 className="text-xl font-black text-slate-900 tracking-tighter uppercase">{viewingIdStudent.studentName}</h1>
                 <p className="text-[10px] font-black bg-slate-900 text-white px-3 py-1 rounded-full uppercase tracking-widest mt-2">{viewingIdStudent.id}</p>
                 
                 <div className="w-full grid grid-cols-2 gap-2 mt-6 text-left">
                   <div className="bg-slate-50 p-2 rounded-xl">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Class</p>
                      <p className="text-sm font-bold tracking-tight text-slate-800">{viewingIdStudent.className}</p>
                   </div>
                   <div className="bg-slate-50 p-2 rounded-xl">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Roll No</p>
                      <p className="text-sm font-bold tracking-tight text-slate-800">{viewingIdStudent.rollNo || 'N/A'}</p>
                   </div>
                   <div className="bg-slate-50 p-2 rounded-xl col-span-2">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Blood Grp / emergency</p>
                      <p className="text-sm font-bold tracking-tight text-slate-800">{viewingIdStudent.mobileNo || 'N/A'}</p>
                   </div>
                 </div>
              </div>
              
              <div className="mt-6 pt-4 border-t border-slate-100 text-center">
                 <p className="text-[8px] font-bold text-slate-400">FOUNDER / PRINCIPAL</p>
                 <div className="w-24 h-6 mx-auto mt-1 border-b disabled flex items-end justify-center"><span className="text-[10px] opacity-20 italic font-mono">stamp</span></div>
              </div>
            </div>
            {/* Background design accents */}
            <div className="absolute top-0 left-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl -z-10" />
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl -z-10" />
          </div>
        </div>
      )}

       {/* Status Bar */}
       <footer className="mt-auto bg-slate-900 text-slate-400 px-8 py-3 text-[10px] flex justify-between items-center w-full print:hidden">
        <div className="flex items-center gap-4">
          <School className="w-4 h-4 text-blue-600" />
          <span className="font-bold tracking-widest uppercase opacity-60">MNSSS Core Framework 2.1 • Gotegaon</span>
        </div>
        <div className="flex items-center gap-4 font-bold uppercase tracking-widest">
          <span className="flex items-center gap-1.5 text-emerald-400"><div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" /> Final Session Node Active</span>
          <span className="opacity-40">|</span>
          <span>{new Date().toDateString()}</span>
        </div>
      </footer>
    </div>
  );
}
