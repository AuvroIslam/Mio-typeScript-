import React, { createContext, useState, useContext } from 'react';

interface RegistrationData {
  // Personal Info
  displayName: string;
  age: string;
  gender: 'male' | 'female';
  location: string;
  matchWith: 'male' | 'female' | 'everyone';
  matchLocation: 'local' | 'worldwide';
  
  // Profile Pics - these store local URIs to images in the device gallery
  // We're not uploading images to Firebase Storage
  profilePic: string | null;
  additionalPics: string[];
  
  // Additional Info
  relationshipStatus: 'single' | 'in a relationship' | 'married';
  favoriteShow: string;
  favoriteMovie: string;
  favoriteBand: string;
}

type RegistrationContextType = {
  registrationData: RegistrationData;
  currentStep: number;
  updateField: <K extends keyof RegistrationData>(field: K, value: RegistrationData[K]) => void;
  nextStep: () => void;
  prevStep: () => void;
  reset: () => void;
};

const defaultRegistrationData: RegistrationData = {
  displayName: '',
  age: '',
  gender: 'male',
  location: '',
  matchWith: 'everyone',
  matchLocation: 'worldwide',
  
  profilePic: null,
  additionalPics: [],
  
  relationshipStatus: 'single',
  favoriteShow: '',
  favoriteMovie: '',
  favoriteBand: '',
};

const RegistrationContext = createContext<RegistrationContextType | undefined>(undefined);

export const useRegistration = () => {
  const context = useContext(RegistrationContext);
  if (context === undefined) {
    throw new Error('useRegistration must be used within a RegistrationProvider');
  }
  return context;
};

export const RegistrationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [registrationData, setRegistrationData] = useState<RegistrationData>(defaultRegistrationData);
  const [currentStep, setCurrentStep] = useState(1);

  const updateField = <K extends keyof RegistrationData>(field: K, value: RegistrationData[K]) => {
    setRegistrationData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const nextStep = () => {
    setCurrentStep(prev => Math.min(prev + 1, 3));
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const reset = () => {
    setRegistrationData(defaultRegistrationData);
    setCurrentStep(1);
  };

  const value = {
    registrationData,
    currentStep,
    updateField,
    nextStep,
    prevStep,
    reset,
  };

  return (
    <RegistrationContext.Provider value={value}>
      {children}
    </RegistrationContext.Provider>
  );
}; 