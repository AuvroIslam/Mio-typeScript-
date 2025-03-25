import React, { ReactNode } from 'react';
import {
  View,
  ScrollView,
  Animated,
  StyleSheet,
  StyleProp,
  ViewStyle,
  Dimensions,
  Platform,
} from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DEFAULT_HEADER_HEIGHT = 300;
const MIN_HEADER_HEIGHT = Platform.OS === 'ios' ? 90 : 55;

interface ParallaxScrollViewProps {
  headerImage: ReactNode;
  headerHeight?: number;
  children: ReactNode;
  backgroundColor?: string;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

const ParallaxScrollView: React.FC<ParallaxScrollViewProps> = ({
  headerImage,
  headerHeight = DEFAULT_HEADER_HEIGHT,
  children,
  backgroundColor = '#FFFFFF',
  contentContainerStyle,
}) => {
  const scrollY = new Animated.Value(0);
  
  const headerTranslate = scrollY.interpolate({
    inputRange: [0, headerHeight],
    outputRange: [0, -headerHeight],
    extrapolate: 'clamp',
  });

  const imageOpacity = scrollY.interpolate({
    inputRange: [0, headerHeight / 2, headerHeight],
    outputRange: [1, 0.8, 0.2],
    extrapolate: 'clamp',
  });

  const headerScale = scrollY.interpolate({
    inputRange: [-headerHeight, 0],
    outputRange: [2, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <Animated.View
        style={[
          styles.header,
          {
            height: headerHeight,
            transform: [
              { translateY: headerTranslate },
              { scale: headerScale },
            ],
          },
        ]}
      >
        <Animated.View style={{ opacity: imageOpacity, flex: 1 }}>
          {headerImage}
        </Animated.View>
      </Animated.View>

      <ScrollView
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        contentContainerStyle={[
          styles.scrollViewContent,
          { paddingTop: headerHeight },
          contentContainerStyle,
        ]}
      >
        {children}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    zIndex: 10,
  },
  scrollViewContent: {
    flexGrow: 1,
  },
});

export default ParallaxScrollView;
