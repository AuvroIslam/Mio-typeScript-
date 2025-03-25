# Mio TypeScript

A mobile application built with React Native and Expo for matching users based on their favorite TV shows and movies.

## Features

- User authentication and profile management
- TV show and movie discovery
- Matching algorithm based on common interests
- Real-time chat with matches
- Cool-down timer for match searches
- Match levels (match and super match) based on the number of common shows

## Technologies Used

- React Native / Expo
- TypeScript
- Firebase (Authentication, Firestore)
- Expo Router for navigation
- React Context for state management

## Getting Started

### Prerequisites

- Node.js (v14 or newer)
- npm or yarn
- Expo CLI

### Installation

```bash
# Clone the repository
git clone https://github.com/AuvroIslam/Mio-typeScript-.git

# Navigate to the project directory
cd Mio-typeScript-

# Install dependencies
npm install

# Start the development server
npx expo start
```

### Environment Setup

Create a `.env` file in the root directory with your Firebase configuration:

```
API_KEY=your-api-key
AUTH_DOMAIN=your-auth-domain
PROJECT_ID=your-project-id
STORAGE_BUCKET=your-storage-bucket
MESSAGING_SENDER_ID=your-messaging-sender-id
APP_ID=your-app-id
```

## License

MIT 