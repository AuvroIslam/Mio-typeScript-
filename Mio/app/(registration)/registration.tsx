import React from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  PersonalInfoStep, 
  PhotoUploadStep, 
  AdditionalInfoStep 
} from '../../components/registration';
import { RegistrationProvider, useRegistration } from '../../context/RegistrationContext';

const RegistrationSteps = () => {
  const { currentStep } = useRegistration();

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <PersonalInfoStep />;
      case 2:
        return <PhotoUploadStep />;
      case 3:
        return <AdditionalInfoStep />;
      default:
        return <PersonalInfoStep />;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {renderStep()}
    </SafeAreaView>
  );
};

const Registration = () => {
  return (
    <RegistrationProvider>
      <RegistrationSteps />
    </RegistrationProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFCCE1',
  },
});

export default Registration; 