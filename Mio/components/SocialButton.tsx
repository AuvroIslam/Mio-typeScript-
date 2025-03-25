import React from 'react';
import { TouchableOpacity, Text, StyleSheet, Image, View } from 'react-native';

interface SocialButtonProps {
  icon: any;
  title: string;
  onPress: () => void;
  containerStyles?: string;
}

const SocialButton: React.FC<SocialButtonProps> = ({
  icon,
  title,
  onPress,
  containerStyles = '',
}) => {
  return (
    <TouchableOpacity 
      style={styles.button}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.content}>
        <Image source={icon} style={styles.icon} />
        <Text style={styles.text}>{title}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#F2F9FF',
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    width: '100%',
    borderWidth: 1,
    borderColor: '#FFCCE1',
    marginTop: 12,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: 24,
    height: 24,
    marginRight: 12,
  },
  text: {
    fontSize: 16,
    color: '#8174A0',
    fontWeight: '500',
  },
});

export default SocialButton; 