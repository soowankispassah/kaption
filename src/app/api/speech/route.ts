import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { NextResponse } from 'next/server';

// Validate environment variables
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error('Missing GEMINI_API_KEY environment variable');
}

async function translateWithRetry(model: GenerativeModel, prompt: string, maxRetries = 3): Promise<string | null> {
  let lastError: Error | null = null;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      return text;
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Translation attempt ${i + 1} failed:`, error);
        lastError = error;
      }
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }
  
  console.error('All translation attempts failed:', lastError);
  return null;
}

export async function POST(req: Request) {
  try {
    // Input validation
    const body = await req.json();
    const { text = '', toLang = '' } = body;

    if (!text?.trim() || !toLang?.trim()) {
      return new NextResponse(JSON.stringify({ 
        error: 'Invalid request', 
        details: 'Missing required fields' 
      }), { 
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        }
      });
    }

    // Initialize Gemini for translation
    const genAI = new GoogleGenerativeAI(apiKey as string);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-002" });

    const languageNames = {
      en: 'English',
      hi: 'Hindi',
      kha: 'Khasi'
    } as const;

    type SupportedLanguage = keyof typeof languageNames;

    // Validate target language
    if (!(toLang in languageNames)) {
      return new NextResponse(JSON.stringify({ 
        error: 'Invalid language', 
        details: 'Unsupported target language' 
      }), { 
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        }
      });
    }

    const validatedToLang = toLang as SupportedLanguage;
    const prompt = `Translate the following text to ${languageNames[validatedToLang]}: "${text}". 
    Only translate, no need explanation`;
    
    const translation = await translateWithRetry(model, prompt);

    if (!translation?.trim()) {
      throw new Error('Empty translation received');
    }

    return new NextResponse(JSON.stringify({ translation }), { 
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      }
    });

  } catch (error) {
    console.error('Translation error:', error);
    return new NextResponse(JSON.stringify({ 
      error: 'Translation failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }), { 
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      }
    });
  }
} 