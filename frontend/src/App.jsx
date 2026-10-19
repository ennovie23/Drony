import { Routes, Route, Navigate } from 'react-router-dom';
import SideBar from "./components/shared/Sidebar";
import Live from "./pages/Live";
import FireAssessment from "./pages/FireAssessment";
import FloodAssessment from "./pages/FloodAssessment";
import Instrument from "./pages/Instrument";
import MapPage from "./pages/MapPage";

function App() {
  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <SideBar />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, height: '100vh', overflow: 'hidden' }}>
        <main style={{ flex: 1, overflowY: 'auto' }}>
          <Routes>
            <Route path="/live" element={<Live />} />
            <Route path="/fire" element={<FireAssessment />} />
            <Route path="/flood" element={<FloodAssessment />} />
            <Route path="/flight" element={<Instrument />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="*" element={<Navigate to="/live" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default App;
