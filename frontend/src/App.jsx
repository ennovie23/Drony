import { useState } from 'react';
import SideBar from "./components/shared/Sidebar";
import Header from "./components/shared/Header";
import Dashboard from "./pages/Dashboard";
import Live from "./pages/Live";
import History from "./pages/History";

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <SideBar activeTab={activeTab} setActiveTab={setActiveTab} />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, height: '100vh', overflow: 'hidden' }}>
        <Header />
        <main style={{ flex: 1, overflowY: 'auto' }}>
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'live' && <Live />}
          {activeTab === 'history' && <History />}
        </main>
      </div>
    </div>
  );
}

export default App;
