/**
 * Employee Login Page Component
 * Provides authentication interface for employees to access self-service portal
 */

import { useState } from 'react';
import { Lock, User, AlertCircle } from 'lucide-react';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import hrisLogo from '../../assets/hris-logo.svg';
import '../../styles/admin.css';

interface EmployeeLoginPageProps {
  onLogin: (username: string, password: string) => void;
  isLoading?: boolean;
}

export const EmployeeLoginPage: React.FC<EmployeeLoginPageProps> = ({
  onLogin,
  isLoading = false,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showCredentials, setShowCredentials] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!username.trim()) {
      setError('Employee ID or username is required');
      return;
    }

    if (!password) {
      setError('Password is required');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    onLogin(username, password);
  };

  const handleDemoLogin = (e: React.MouseEvent) => {
    e.preventDefault();
    setUsername('employee01');
    setPassword('hr2024');
    setError('');
    setTimeout(() => {
      onLogin('employee01', 'hr2024');
    }, 100);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-gray-50 to-blue-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          {/* Header Section */}
          <div className="px-6 pt-8 pb-6 text-center border-b border-gray-100">
            <div className="flex justify-center mb-4">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center shadow-md">
                <img
                  src={hrisLogo}
                  alt="City Hall Logo"
                  className="w-16 h-16 rounded-xl"
                />
              </div>
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-1">
              Employee Self-Service
            </h1>
            <p className="text-sm text-gray-600">
              Access your profile and documents
            </p>

            {/* Badge */}
            <span className="inline-block mt-3 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold">
              Iloilo City Hall
            </span>
          </div>

          {/* Form Section */}
          <div className="px-6 py-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Username Field */}
              <Input
                type="text"
                label="Employee ID or Username"
                placeholder="e.g., employee01 or your email"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
                icon={<User size={18} />}
              />

              {/* Password Field */}
              <Input
                type="password"
                label="Password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                icon={<Lock size={18} />}
              />

              {/* Error Message */}
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 flex gap-3">
                  <AlertCircle className="text-red-600 flex-shrink-0" size={20} />
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              {/* Sign In Button */}
              <Button
                type="submit"
                size="lg"
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>

            {/* Divider */}
            <div className="my-6 flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-200"></div>
              <span className="text-xs text-gray-500 font-medium">OR</span>
              <div className="flex-1 h-px bg-gray-200"></div>
            </div>

            {/* Demo Credentials Info Box */}
            <div
              className={`rounded-lg border-2 p-4 transition-all cursor-pointer ${
                showCredentials
                  ? 'bg-blue-50 border-blue-300'
                  : 'bg-gray-50 border-gray-200 hover:border-blue-200'
              }`}
              onClick={() => setShowCredentials(!showCredentials)}
            >
              <p className="text-xs font-semibold text-gray-700 mb-2">
                Demo Credentials
              </p>
              {showCredentials ? (
                <div className="space-y-2 text-sm">
                  <div className="bg-white rounded px-2 py-1 font-mono text-blue-700">
                    Username: <span className="font-bold">employee01</span>
                  </div>
                  <div className="bg-white rounded px-2 py-1 font-mono text-blue-700">
                    Password: <span className="font-bold">hr2024</span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleDemoLogin}
                    className="w-full mt-2"
                  >
                    Use Demo Credentials
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-gray-600">
                  Click to view demo login credentials
                </p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-600">
              Having trouble? Contact{' '}
              <span className="font-semibold text-gray-700">HRMO at ext. 5000</span>
            </p>
          </div>
        </div>

        {/* Security Notice */}
        <div className="mt-6 text-center text-xs text-gray-600">
          <p>🔒 Your information is secure and encrypted</p>
          <p className="mt-1">© 2024 Iloilo City Hall. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
};
