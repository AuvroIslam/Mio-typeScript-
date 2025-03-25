# Firebase Setup Instructions

## 1. Firebase Security Rules Setup

To fix the "Missing or insufficient permissions" error, you need to update your Firebase Firestore security rules.

1. Go to your [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to Firestore Database
4. Click on the "Rules" tab
5. Replace the current rules with these:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow authenticated users to read and write their own data
    match /users/{userId} {
      allow create: if request.auth != null;
      allow read, update: if request.auth != null && request.auth.uid == userId;
    }
    
    // Add more collection rules as needed for your app
  }
}
```

6. Click "Publish" to save the rules

## 2. Authentication Setup

Make sure you've enabled Email/Password authentication:

1. In Firebase Console, go to Authentication > Sign-in method
2. Make sure Email/Password is enabled

## 3. Additional Monitoring

1. In your app, check the browser console or device logs for any Firebase-specific errors
2. Firebase Authentication and Firestore errors provide detailed error codes that help identify the problem

## 4. AsyncStorage Setup

The app uses AsyncStorage for better auth persistence, which helps keep users logged in between app sessions.

## 5. Deployment

When deploying your app to production, make sure to:

1. Add the app's production domain to the Firebase Authentication authorized domains
2. Update any environment-specific configurations
3. Test the authentication flow on the production app 