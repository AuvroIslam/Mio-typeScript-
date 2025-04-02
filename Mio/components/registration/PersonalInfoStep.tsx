import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import DropDownPicker from 'react-native-dropdown-picker';
import { InputField } from '../index';
import { useRegistration } from '../../context/RegistrationContext';
import { countries } from '../../data/countries';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { COLORS } from '../../constants/Colors';

const PersonalInfoStep = () => {
  const { registrationData, updateField, nextStep } = useRegistration();
  const [errors, setErrors] = useState({
    displayName: '',
    age: '',
    location: '',
  });
  
  // Dropdown state and value
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(registrationData.location || null);
  const [countriesItems, setCountriesItems] = useState(countries);

  const validateForm = () => {
    let isValid = true;
    const newErrors = {
      displayName: '',
      age: '',
      location: '',
    };

    if (!registrationData.displayName) {
      newErrors.displayName = 'Display name is required';
      isValid = false;
    }

    if (!registrationData.age) {
      newErrors.age = 'Age is required';
      isValid = false;
    } else if (isNaN(Number(registrationData.age)) || Number(registrationData.age) < 18) {
      newErrors.age = 'You must be at least 18 years old';
      isValid = false;
    }

    if (!registrationData.location) {
      newErrors.location = 'Location is required';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleNext = () => {
    if (validateForm()) {
      nextStep();
    }
  };

  return (
    <>
      <StatusBar backgroundColor="white" barStyle="dark-content" />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Tell Us About Yourself</Text>
        <Text style={styles.subtitle}>Let's get to know you better</Text>

        <InputField
          label="Display Name"
          value={registrationData.displayName}
          onChangeText={(text) => updateField('displayName', text)}
          placeholder="Your display name"
          error={errors.displayName}
        />

        <InputField
          label="Age"
          value={registrationData.age}
          onChangeText={(text) => updateField('age', text)}
          placeholder="Your age"
          keyboardType="numeric"
          error={errors.age}
        />

        <View style={styles.dropdownContainer}>
          <Text style={styles.label}>Location</Text>
          <DropDownPicker
            open={open}
            value={value}
            items={countriesItems}
            setOpen={setOpen}
            setValue={setValue}
            onChangeValue={(val) => {
              if (val) updateField('location', val);
            }}
            setItems={setCountriesItems}
            placeholder="Select your country"
            
            // Simplified styling using COLORS from Colors.ts
            style={{
              ...styles.dropdown,
              borderColor: COLORS.darkMaroon,
              backgroundColor: 'white',
              borderWidth: 1,
            }}
            dropDownContainerStyle={{
              ...styles.dropdownList,
              borderColor: COLORS.secondary,
              backgroundColor: COLORS.white,
            }}
            textStyle={{
              ...styles.dropdownText,
              color: COLORS.text.primary,
            }}
            placeholderStyle={{
              color: COLORS.text.light,
            }}
            
            // Simplified icons
            ArrowDownIconComponent={() => (
              <Ionicons name="chevron-down" size={18} color={COLORS.secondary} />
            )}
            ArrowUpIconComponent={() => (
              <Ionicons name="chevron-up" size={18} color={COLORS.secondary} />
            )}
            
            // Configure scrolling
            listMode="SCROLLVIEW"
            scrollViewProps={{
              nestedScrollEnabled: true,
              showsVerticalScrollIndicator: true,
            }}
            maxHeight={200}
            searchable={true}
            searchPlaceholder="Search countries..."
            searchContainerStyle={{
              borderBottomColor: COLORS.secondary,
              padding: 10,
            }}
            searchTextInputStyle={{
              color: COLORS.text.primary,
              borderColor: COLORS.secondary,
              backgroundColor: COLORS.tertiary,
              padding: 8,
              borderRadius: 8,
            }}
            zIndex={3000}
          />
          {errors.location ? (
            <Text style={{ ...styles.errorText, color: COLORS.error }}>
              {errors.location}
            </Text>
          ) : null}
        </View>

        <View style={[styles.sectionTitle, { marginTop: open ? 210 : 8 }]}>
          <Text style={styles.label}>Gender</Text>
        </View>
        <View style={styles.optionsContainer}>
          <TouchableOpacity
            style={[
              styles.option,
              registrationData.gender === 'male' && styles.selectedOption,
            ]}
            onPress={() => updateField('gender', 'male')}
          >
            <Text
              style={[
                styles.optionText,
                registrationData.gender === 'male' && styles.selectedOptionText,
              ]}
            >
              Male
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.option,
              registrationData.gender === 'female' && styles.selectedOption,
            ]}
            onPress={() => updateField('gender', 'female')}
          >
            <Text
              style={[
                styles.optionText,
                registrationData.gender === 'female' && styles.selectedOptionText,
              ]}
            >
              Female
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionTitle}>
          <Text style={styles.label}>Want to match with</Text>
        </View>
        <View style={styles.optionsContainer}>
          <TouchableOpacity
            style={[
              styles.option,
              registrationData.matchWith === 'male' && styles.selectedOption,
            ]}
            onPress={() => updateField('matchWith', 'male')}
          >
            <Text
              style={[
                styles.optionText,
                registrationData.matchWith === 'male' && styles.selectedOptionText,
              ]}
            >
              Male
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.option,
              registrationData.matchWith === 'female' && styles.selectedOption,
            ]}
            onPress={() => updateField('matchWith', 'female')}
          >
            <Text
              style={[
                styles.optionText,
                registrationData.matchWith === 'female' && styles.selectedOptionText,
              ]}
            >
              Female
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.option,
              registrationData.matchWith === 'everyone' && styles.selectedOption,
            ]}
            onPress={() => updateField('matchWith', 'everyone')}
          >
            <Text
              style={[
                styles.optionText,
                registrationData.matchWith === 'everyone' && styles.selectedOptionText,
              ]}
            >
              Everyone
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionTitle}>
          <Text style={styles.label}>Location Preference</Text>
        </View>
        <View style={styles.optionsContainer}>
          <TouchableOpacity
            style={[
              styles.option,
              registrationData.matchLocation === 'local' && styles.selectedOption,
            ]}
            onPress={() => updateField('matchLocation', 'local')}
          >
            <Text
              style={[
                styles.optionText,
                registrationData.matchLocation === 'local' && styles.selectedOptionText,
              ]}
            >
              Local
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.option,
              registrationData.matchLocation === 'worldwide' && styles.selectedOption,
            ]}
            onPress={() => updateField('matchLocation', 'worldwide')}
          >
            <Text
              style={[
                styles.optionText,
                registrationData.matchLocation === 'worldwide' && styles.selectedOptionText,
              ]}
            >
              Worldwide
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.button} onPress={handleNext}>
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </ScrollView>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.secondary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.text.light,
    marginBottom: 24,
  },
  sectionTitle: {
    marginBottom: 8,
    marginTop: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.secondary,
    marginBottom: 8,
  },
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  option: {
    borderWidth: 1,
    borderColor: COLORS.darkestMaroon,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginRight: 10,
    marginBottom: 10,
    backgroundColor: 'white',
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  selectedOption: {
    backgroundColor: COLORS.darkMaroon,
    borderColor: COLORS.secondary,
    shadowColor: COLORS.secondary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  optionText: {
    color: COLORS.secondary,
  },
  selectedOptionText: {
    color: COLORS.white,
  },
  button: {
    backgroundColor: COLORS.darkMaroon,
    borderRadius: 20,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
  },
  dropdownContainer: {
    marginBottom: 16,
    zIndex: 5000,
  },
  dropdown: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1.5,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  dropdownText: {
    fontSize: 16,
  },
  dropdownList: {
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderRadius: 12,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
  },
});

export default PersonalInfoStep; 