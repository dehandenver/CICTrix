// src/types.ts

export interface SignupFormData {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface Feature {
  title: string;
  description: string;
  icon?: React.ReactNode;
}

export interface OnboardingStep {
  title: string;
  description: string;
  isCompleted: boolean;
}