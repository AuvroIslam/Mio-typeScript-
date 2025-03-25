import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import DropDownPicker from 'react-native-dropdown-picker';
import { InputField } from '../index';
import { useRegistration } from '../../context/RegistrationContext';
import { countries } from '../../data/countries';
import Ionicons from 'react-native-vector-icons/Ionicons';

const PersonalInfoStep = () => {
  const { registrationData, updateField, nextStep } = useRegistration();
  const [errors, setErrors] = useState({
    displayName: '',
    age: '',
    location: '',
  });
  
  // Dropdown state
  const [open, setOpen] = useState(false);
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
          value={registrationData.location}
          items={countriesItems}
          setOpen={setOpen}
          setValue={(val) => updateField('location', val())}
          setItems={setCountriesItems}
          placeholder="Select your country"
          placeholderStyle={styles.placeholderStyle}
          style={styles.dropdown}
          dropDownContainerStyle={styles.dropdownListContainer}
          textStyle={styles.dropdownText}
          listItemContainerStyle={styles.dropdownItemContainer}
          listItemLabelStyle={styles.dropdownItemLabel}
          selectedItemContainerStyle={styles.selectedItemContainer}
          selectedItemLabelStyle={styles.selectedItemLabel}
          searchContainerStyle={styles.searchContainer}
          searchTextInputStyle={styles.searchTextInput}
          ArrowDownIconComponent={() => <Ionicons name="chevron-down" size={20} color="#8174A0" />}
          ArrowUpIconComponent={() => <Ionicons name="chevron-up" size={20} color="#8174A0" />}
          CloseIconComponent={() => <Ionicons name="close-circle" size={20} color="#8174A0" />}
          TickIconComponent={() => <Ionicons name="checkmark-circle" size={20} color="#8174A0" />}
          searchPlaceholder="Search for a country..."
          searchPlaceholderTextColor="#888"
          listMode="SCROLLVIEW"
          scrollViewProps={{
            nestedScrollEnabled: true,
          }}
          searchable={true}
          zIndex={1000}
          zIndexInverse={3000}
        />
        {errors.location ? <Text style={styles.errorText}>{errors.location}</Text> : null}
      </View>

      <View style={[styles.sectionTitle, { marginTop: open ? 250 : 8 }]}>
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
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#8174A0',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    marginBottom: 24,
  },
  sectionTitle: {
    marginBottom: 8,
    marginTop: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: '#8174A0',
    marginBottom: 8,
  },
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  option: {
    borderWidth: 1,
    borderColor: '#FFCCE1',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginRight: 10,
    marginBottom: 10,
    backgroundColor: '#FFF5D7',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  selectedOption: {
    backgroundColor: '#8174A0',
    borderColor: '#8174A0',
    shadowColor: '#8174A0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  optionText: {
    color: '#8174A0',
  },
  selectedOptionText: {
    color: '#FFF',
  },
  button: {
    backgroundColor: '#8174A0',
    borderRadius: 20,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  dropdownContainer: {
    marginBottom: 16,
    zIndex: 5000,
  },
  dropdown: {
    borderColor: '#FFCCE1',
    borderRadius: 12,
    backgroundColor: '#F2F9FF',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  dropdownText: {
    color: '#333',
    fontSize: 16,
    fontFamily: 'System',
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 12,
    marginTop: 4,
  },
  placeholderStyle: {
    color: '#888',
    fontSize: 16,
  },
  dropdownListContainer: {
    borderColor: '#FFCCE1',
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderRadius: 12,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
    zIndex: 5000,
  },
  dropdownItemContainer: {
    padding: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#FFCCE1',
  },
  dropdownItemLabel: {
    color: '#333',
    fontSize: 16,
  },
  selectedItemContainer: {
    backgroundColor: '#F2F9FF',
    borderLeftWidth: 3,
    borderLeftColor: '#8174A0',
  },
  selectedItemLabel: {
    color: '#8174A0',
    fontWeight: '500',
  },
  searchContainer: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#FFCCE1',
  },
  searchTextInput: {
    color: '#333',
    fontSize: 16,
    borderColor: '#FFCCE1',
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: '#F2F9FF',
    padding: 8,
  },
});

export default PersonalInfoStep; 