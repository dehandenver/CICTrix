import React from 'react';

const HeroIllustration: React.FC = () => {
  return (
    <div className="flex items-center justify-center h-full bg-gray-100">
      <img
        src="/path/to/your/illustration.svg" // Replace with the actual path to your illustration
        alt="Hero Illustration"
        className="max-w-full h-auto"
      />
    </div>
  );
};

export default HeroIllustration;