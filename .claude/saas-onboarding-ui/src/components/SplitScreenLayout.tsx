import React from 'react';

const SplitScreenLayout: React.FC<{ leftContent: React.ReactNode; rightContent: React.ReactNode }> = ({ leftContent, rightContent }) => {
  return (
    <div className="flex h-screen">
      <div className="w-1/2 bg-gray-100 flex items-center justify-center p-10">
        {leftContent}
      </div>
      <div className="w-1/2 bg-white flex items-center justify-center p-10">
        {rightContent}
      </div>
    </div>
  );
};

export default SplitScreenLayout;