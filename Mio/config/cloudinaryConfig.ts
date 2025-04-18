// Cloudinary configuration for React Native
// We use Firebase Functions for secure uploads
import { Platform } from 'react-native';
import { getFunctions, httpsCallable } from "firebase/functions";

// Function to upload an image to Cloudinary using signed upload
export const uploadImage = async (localUri: string): Promise<string> => {
  try {
    // Get the Cloudinary signature from Firebase Function
    const functions = getFunctions();
    const getCloudinarySignature = httpsCallable(functions, 'getCloudinarySignature');
    const signatureResult = await getCloudinarySignature();
    
    // Extract signature data
    const signatureData = signatureResult.data as {
      signature: string;
      timestamp: number;
      cloudName: string;
      apiKey: string;
      folder: string;
      uploadPreset: string;
    };
    
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
    
    // Add all required parameters for signed upload
    formData.append('file', {
      uri: fileUri,
      type: mimeType,
      name: fileName,
    } as any);
    
    // Add parameters from signature response
    formData.append('signature', signatureData.signature);
    formData.append('timestamp', String(signatureData.timestamp));
    formData.append('api_key', signatureData.apiKey);
    formData.append('folder', signatureData.folder);
    formData.append('upload_preset', signatureData.uploadPreset);
    
    // Build the upload URL with the cloud name
    const uploadUrl = `https://api.cloudinary.com/v1_1/${signatureData.cloudName}/image/upload`;
    
    // Upload to Cloudinary using fetch
    const uploadResponse = await fetch(uploadUrl, {
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