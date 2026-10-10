import React, { useState } from 'react';
import { API_BASE_URL } from '../../config';

// `onStart` and `onPause` can be passed to trigger UI updates in parent components
export default function SimulateBtn({ onStart, onPause }) {
  const [loading, setLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const toggleSimulation = async () => {
    setLoading(true);

    // Pick endpoint and action based on current state
    const endpoint = isRunning 
      ? `${API_BASE_URL}/api/drone/stop-simulation` 
      : `${API_BASE_URL}/api/drone/start-simulation`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        if (isRunning) {
          setIsRunning(false);
          onPause?.();
        } else {
          setIsRunning(true);
          onStart?.();
        }
      } else {
        console.error('Simulation request failed:', data);
      }
    } catch (error) {
      console.error('Failed to toggle simulation:', error);
    } finally {
      setLoading(false);
    }
  };

  // Determine button text based on state
  const getButtonText = () => {
    if (loading) {
      return isRunning ? 'Pausing…' : 'Starting…';
    }
    return isRunning ? '⏸ Pause Simulation' : 'Start Simulation';
  };

  return (
    <div style={{ padding: '10px' }}>
      <button
        id="toggle-simulation-btn"
        onClick={toggleSimulation}
        disabled={loading}
        style={{
          backgroundColor: loading 
            ? '#666666' 
            : isRunning 
              ? '#d97706' // Amber/Orange when running (to show Pause action)
              : '#ff4d4d', // Red when stopped (to show Start action)
          color: 'white',
          padding: '10px 20px',
          border: 'none',
          borderRadius: '6px',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontWeight: 'bold',
          opacity: loading ? 0.7 : 1,
          transition: 'all 0.2s ease',
        }}
      >
        {getButtonText()}
      </button>
    </div>
  );
}