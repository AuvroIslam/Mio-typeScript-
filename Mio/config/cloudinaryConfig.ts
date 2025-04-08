// Cloudinary configuration for React Native
// We use direct HTTP API instead of the Node.js SDK which isn't compatible with React Native
import { Platform } from 'react-native';

// Cloudinary configuration
const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || '';
if (!CLOUD_NAME) {
  console.error('EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME is not defined in environment variables');
}

// The upload URL with preset
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET || '';
if (!UPLOAD_PRESET) {
  console.error('EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET is not defined in environment variables');
}


// Function to upload an image to Cloudinary using unsigned upload with preset
export const uploadImage = async (localUri: string): Promise<string> => {
  try {
    // Validate required configuration
    if (!CLOUD_NAME || !UPLOAD_PRESET) {
      throw new Error('Cloudinary configuration is incomplete. Please check CLOUD_NAME and UPLOAD_PRESET.');
    }

    // Create form data for upload
    const formData = new FormData();
    
    // Get file name from URI
    const uriParts = localUri.split('/');
    const fileName = uriParts[uriParts.length - 1];
    
    // Extract file extension (assuming format like image.jpg)
    const fileExtension = fileName.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeType = fileExtension === 'png' ? 'image/png' : 'image/jpeg';
    
    // For React Native, we need to create a file object
    // Ensure the uri starts with 'file://' for Android compatibility
    const fileUri = Platform.OS === 'android' && !localUri.startsWith('file://') 
      ? `file://${localUri}` 
      : localUri;
    

    
    // Append file to formData
    formData.append('file', {
      uri: fileUri,
      type: mimeType,
      name: fileName,
    } as any);
    
    formData.append('upload_preset', UPLOAD_PRESET);
    formData.append('folder', 'mio_app_profiles');
    

    
    // Upload to Cloudinary using fetch
    const uploadResponse = await fetch(CLOUDINARY_UPLOAD_URL, {
      method: 'POST',
      body: formData,
      headers: {
        'Accept': 'application/json',
      },
    });
    
  
    const uploadResult = await uploadResponse.json();
    
    if (uploadResponse.ok) {
          return uploadResult.secure_url;
    } else {
      console.error('Upload failed:', uploadResult.error);
      throw new Error(uploadResult.error?.message || 'Upload failed');
    }
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    throw error;
  }
};

// Export configuration
export const cloudinaryConfig = {
  cloudName: CLOUD_NAME,
  uploadPreset: UPLOAD_PRESET,
  uploadUrl: CLOUDINARY_UPLOAD_URL,
  isConfigured: Boolean(CLOUD_NAME && UPLOAD_PRESET)
};

export default cloudinaryConfig; 