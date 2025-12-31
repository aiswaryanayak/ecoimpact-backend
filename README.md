# EcoImpact Backend API

Express.js backend with Google Gemini AI integration for sustainability platform.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```
GEMINI_API_KEY=your_api_key_here
PORT=5000
```

3. Start server:
```bash
npm start
```

## API Endpoints

- `POST /api/calculate-footprint` - Calculate carbon footprint
- `POST /api/ai-advice` - Get AI recommendations
- `POST /api/simulate-impact` - Simulate future impact
- `POST /api/ecoscan` - Analyze product sustainability
- `POST /api/ecobloom` - AI plant companion chat
- `POST /api/awareness-chat` - Climate education chatbot

## Deployment

**Render.com:**
- Build Command: `npm install`
- Start Command: `npm start`
- Add `GEMINI_API_KEY` in environment variables
