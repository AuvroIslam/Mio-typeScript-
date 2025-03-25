const { getDefaultConfig } = require("@expo/metro-config");
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Configure Metro to handle CSS files
config.resolver.sourceExts.push('css');

module.exports = withNativeWind(config, { input: './global.css' }); 