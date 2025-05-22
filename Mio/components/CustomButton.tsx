import { ActivityIndicator, Text, TouchableOpacity, StyleSheet, View } from "react-native";
import React, { ReactNode } from "react";
import { COLORS } from "../constants/Colors";

interface CustomButtonProps {
  title: string;
  handlePress: () => void;
  containerStyles?: string;
  textStyles?: string;
  isLoading?: boolean;
  icon?: ReactNode;
  disabled?: boolean;
}

const CustomButton = ({
  title,
  handlePress,
  containerStyles,
  textStyles,
  isLoading,
  icon,
  disabled,
}: CustomButtonProps) => {
  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      style={styles.button}
      className={`w-11/12 flex flex-row justify-center items-center ${containerStyles} ${
        isLoading ? "opacity-50" : ""
      }`}
      disabled={isLoading || disabled}
    >
      <View style={icon ? styles.contentContainerWithIcon : styles.contentContainer}>
        <Text style={styles.buttonText} className={`font-psemibold text-lg ${textStyles}`}>
          {title}
        </Text>
        {isLoading && (
          <ActivityIndicator
            animating={isLoading}
            color={COLORS.maroon}
            size="small"
            className="ml-2"
          />
        )}
        {icon && !isLoading && <View style={styles.iconSpacing}>{icon}</View>}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    borderRadius: 40,
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: COLORS.darkMaroon,
  },
  contentContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentContainerWithIcon: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconSpacing: {
    marginLeft: 8,
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
  }
});

export default CustomButton;