export const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  loan_officer: 'Loan Officer',
  borrower: 'Borrower',
}

export const STAFF_ROLES = ['super_admin', 'admin', 'loan_officer']
export const ADMIN_ROLES = ['super_admin', 'admin']

export const APPLICATION_STATUS = {
  pending: { label: 'Pending', tone: 'amber' },
  under_review: { label: 'Under Review', tone: 'blue' },
  additional_info_required: { label: 'Additional Info Required', tone: 'orange' },
  approved: { label: 'Approved', tone: 'emerald' },
  rejected: { label: 'Rejected', tone: 'rose' },
  for_agreement: { label: 'For Agreement', tone: 'indigo' },
  ready_for_disbursement: { label: 'Ready for Disbursement', tone: 'cyan' },
  active: { label: 'Active', tone: 'emerald' },
  completed: { label: 'Completed', tone: 'slate' },
  cancelled: { label: 'Cancelled', tone: 'gray' },
}

export const LOAN_STATUS = {
  approved: { label: 'Approved', tone: 'emerald' },
  for_agreement: { label: 'For Agreement', tone: 'indigo' },
  ready_for_disbursement: { label: 'Ready for Disbursement', tone: 'cyan' },
  active: { label: 'Active', tone: 'emerald' },
  completed: { label: 'Completed', tone: 'slate' },
  cancelled: { label: 'Cancelled', tone: 'gray' },
  written_off: { label: 'Written Off', tone: 'rose' },
}

export const SCHEDULE_STATUS = {
  pending: { label: 'Pending', tone: 'amber' },
  partial: { label: 'Partially Paid', tone: 'blue' },
  paid: { label: 'Paid', tone: 'emerald' },
  overdue: { label: 'Overdue', tone: 'rose' },
  waived: { label: 'Waived', tone: 'gray' },
}

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'gcash', label: 'GCash' },
  { value: 'check', label: 'Check' },
  { value: 'other', label: 'Other' },
]

export const DISBURSEMENT_METHODS = PAYMENT_METHODS

export const EMPLOYMENT_STATUSES = [
  { value: 'employed', label: 'Employed' },
  { value: 'self_employed', label: 'Self-employed' },
  { value: 'business_owner', label: 'Business Owner' },
  { value: 'unemployed', label: 'Unemployed' },
  { value: 'retired', label: 'Retired' },
  { value: 'student', label: 'Student' },
]

export const PAYMENT_FREQUENCIES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
]

export const BORROWER_STATUS = {
  active: { label: 'Active', tone: 'emerald' },
  inactive: { label: 'Inactive', tone: 'gray' },
  blacklisted: { label: 'Blacklisted', tone: 'rose' },
}

export const APPLICATION_FLOW = [
  'pending',
  'under_review',
  'approved',
  'for_agreement',
  'ready_for_disbursement',
  'active',
  'completed',
]

export const STAFF_NAV = [
  { to: '/staff', label: 'Dashboard', icon: 'LayoutDashboard', end: true },
  { to: '/staff/applications', label: 'Applications', icon: 'FileText' },
  { to: '/staff/borrowers', label: 'Borrowers', icon: 'Users' },
  { to: '/staff/loans', label: 'Loans', icon: 'Wallet' },
  { to: '/staff/disbursements', label: 'Disbursements', icon: 'Banknote' },
  { to: '/staff/repayments', label: 'Repayments', icon: 'ReceiptText' },
  { to: '/staff/reports', label: 'Reports', icon: 'BarChart3' },
]

export const ADMIN_NAV = [
  { to: '/admin/loan-types', label: 'Loan Types', icon: 'SlidersHorizontal' },
  { to: '/admin/users', label: 'Staff & Users', icon: 'ShieldCheck' },
  { to: '/admin/audit-logs', label: 'Audit Logs', icon: 'ScrollText' },
]

export const BORROWER_NAV = [
  { to: '/borrower', label: 'Dashboard', icon: 'LayoutDashboard', end: true },
  { to: '/borrower/apply', label: 'Apply for a Loan', icon: 'PlusCircle' },
  { to: '/borrower/applications', label: 'My Applications', icon: 'FileText' },
  { to: '/borrower/loans', label: 'My Loans', icon: 'Wallet' },
  { to: '/borrower/profile', label: 'My Profile', icon: 'UserCircle' },
]
