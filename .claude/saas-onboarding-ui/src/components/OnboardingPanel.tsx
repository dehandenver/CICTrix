import React from 'react';
import SplitScreenLayout from './SplitScreenLayout';
import SignupForm from './SignupForm';

const OnboardingPanel: React.FC = () => {
  return (
    <SplitScreenLayout>
      <div className="flex flex-col justify-center p-8">
        <h1 className="text-4xl font-bold text-gray-800">Welcome to Our HR Management Platform</h1>
        <p className="mt-4 text-lg text-gray-600">
          Join us to streamline your HR processes and enhance your team's productivity.
        </p>
      </div>
      <div className="flex items-center justify-center p-8">
        <SignupForm />
      </div>
    </SplitScreenLayout>
  );
};

export default OnboardingPanel;