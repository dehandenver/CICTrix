import React from 'react';
import OnboardingPanel from './components/OnboardingPanel';

const App: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <OnboardingPanel />
    </div>
  );
};

export default App;