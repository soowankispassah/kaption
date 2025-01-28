# Live Translation App

A real-time speech-to-text translation application that supports multiple languages. The app transcribes speech in real-time and provides instant translations.

## Features

- Real-time speech-to-text transcription
- Instant translation to multiple languages (English, Hindi, Khasi)
- Mobile-responsive design
- Live mode and history viewing
- Error handling and retry mechanisms
- Fullscreen and expanded view modes (desktop only)

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Google Gemini AI for translations
- Web Speech API for audio processing

## Prerequisites

Before you begin, ensure you have:

- Node.js 18.x or later
- A Google Gemini API key
- npm or yarn package manager
- Git for version control

## Local Development

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd <repository-name>
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```

3. Copy the example environment file:
   ```bash
   cp .env.example .env.local
   ```

4. Update the environment variables in `.env.local` with your values:
   - Add your Gemini API key
   - Update the NEXT_PUBLIC_APP_URL if needed

5. Run the development server:
   ```bash
   npm run dev
   # or
   yarn dev
   ```

## Deployment to Vercel

1. Push your code to a Git repository (GitHub, GitLab, or Bitbucket)

2. Connect your repository to Vercel:
   - Go to [Vercel](https://vercel.com)
   - Click "New Project"
   - Import your repository
   - Select the repository owner
   - Configure project settings:
     - Framework Preset: Next.js
     - Root Directory: ./
     - Build Command: next build
     - Output Directory: .next

3. Add Environment Variables:
   - Go to Project Settings > Environment Variables
   - Add the following variables:
     - GEMINI_API_KEY
     - NEXT_PUBLIC_APP_URL (your production URL)

4. Deploy:
   - Click "Deploy"
   - Vercel will automatically build and deploy your application

## Automatic Deployments

- Pushing to the main branch will trigger automatic deployments
- Preview deployments are created for pull requests
- Environment variables are automatically applied to all deployments

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Environment Variables

- `GEMINI_API_KEY`: Your Google Gemini API key
- `RATE_LIMIT_MAX_REQUESTS`: Maximum number of requests per minute per IP (default: 10)
- `RATE_LIMIT_WINDOW_MS`: Time window for rate limiting in milliseconds (default: 60000)
- `NEXT_PUBLIC_APP_URL`: Your application's public URL

## Security Considerations

- API routes are protected with rate limiting
- Environment variables are properly handled
- Input validation is implemented
- Error handling is in place

## Browser Support

The application requires a modern browser with support for:
- Web Speech API
- WebSocket connections
- ES6+ JavaScript features

## Support

For support, please open an issue in the GitHub repository.
