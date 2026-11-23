import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { HomeRedirect, ProtectedRoute, RoleRoute } from './components/ProtectedRoute'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import NotFound from './pages/NotFound'
import Notifications from './pages/Notifications'
import BorrowerDashboard from './pages/borrower/BorrowerDashboard'
import BorrowerProfile from './pages/borrower/Profile'
import ApplyLoan from './pages/borrower/ApplyLoan'
import BorrowerApplications from './pages/borrower/Applications'
import BorrowerApplicationDetail from './pages/borrower/ApplicationDetail'
import MyLoans from './pages/borrower/MyLoans'
import LoanDetail from './pages/shared/LoanDetail'
import StaffDashboard from './pages/staff/StaffDashboard'
import StaffApplications from './pages/staff/Applications'
import ApplicationReview from './pages/staff/ApplicationReview'
import StaffBorrowers from './pages/staff/Borrowers'
import StaffLoans from './pages/staff/Loans'
import Disbursements from './pages/staff/Disbursements'
import Repayments from './pages/staff/Repayments'
import Reports from './pages/staff/Reports'
import LoanTypes from './pages/admin/LoanTypes'
import Users from './pages/admin/Users'
import AuditLogs from './pages/admin/AuditLogs'

const STAFF = ['super_admin', 'admin', 'loan_officer']
const ADMINS = ['super_admin', 'admin']

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<HomeRedirect />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="loans/:id" element={<LoanDetail />} />

          <Route element={<RoleRoute roles={['borrower']} />}>
            <Route path="borrower" element={<BorrowerDashboard />} />
            <Route path="borrower/profile" element={<BorrowerProfile />} />
            <Route path="borrower/apply" element={<ApplyLoan />} />
            <Route path="borrower/applications" element={<BorrowerApplications />} />
            <Route path="borrower/applications/:id" element={<BorrowerApplicationDetail />} />
            <Route path="borrower/loans" element={<MyLoans />} />
          </Route>

          <Route element={<RoleRoute roles={STAFF} />}>
            <Route path="staff" element={<StaffDashboard />} />
            <Route path="staff/applications" element={<StaffApplications />} />
            <Route path="staff/applications/:id" element={<ApplicationReview />} />
            <Route path="staff/borrowers" element={<StaffBorrowers />} />
            <Route path="staff/loans" element={<StaffLoans />} />
            <Route path="staff/disbursements" element={<Disbursements />} />
            <Route path="staff/repayments" element={<Repayments />} />
            <Route path="staff/reports" element={<Reports />} />
          </Route>

          <Route element={<RoleRoute roles={ADMINS} />}>
            <Route path="admin/loan-types" element={<LoanTypes />} />
            <Route path="admin/users" element={<Users />} />
            <Route path="admin/audit-logs" element={<AuditLogs />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  )
}
