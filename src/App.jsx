import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Pending from './pages/Pending';
import Dashboard from './pages/Dashboard';
import MemberList from './components/MemberList';
import FamilyDetail from './pages/FamilyDetail';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/pending" element={<Pending />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<MemberList />} />
            <Route path="/add" element={<Dashboard />} />
            <Route path="/family/:id" element={<FamilyDetail />} />
            {/* 추가적인 보호된 라우트는 이곳에 */}
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
