import React from 'react';
import { Route, Routes } from 'react-router-dom';
import LandingPage from './pages/LandingPage.jsx';
import AgentPortal from './pages/AgentPortal.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/landing" element={<LandingPage />} />
      <Route path="/agent/*" element={<AgentPortal />} />
      <Route path="*" element={<LandingPage />} />
    </Routes>
  );
}
