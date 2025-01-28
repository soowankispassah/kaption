import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { createReadStream } from 'fs';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const maxDuration = 300; // 5 minutes max duration
export const config = {
  api: {
    bodyParser: false,
  },
};

export async function POST(request: Request) {
  let tempFilePath: string | null = null;
  
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;

    if (!audioFile) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      );
    }

    // Log file details for debugging
    console.log('Audio file details:', {
      name: audioFile.name,
      type: audioFile.type,
      size: audioFile.size,
    });

    if (audioFile.size > 25 * 1024 * 1024) { // 25MB limit
      return NextResponse.json(
        { error: 'Audio file too large. Maximum size is 25MB.' },
        { status: 400 }
      );
    }

    // Create a temporary file
    const bytes = await audioFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // Create a temporary file path with the correct extension
    tempFilePath = join(tmpdir(), `whisper-${Date.now()}.wav`);
    
    // Write the buffer to a temporary file
    await writeFile(tempFilePath, buffer);
    
    console.log('Temporary file created at:', tempFilePath);

    try {
      // Use the temporary file for transcription
      const transcription = await openai.audio.transcriptions.create({
        file: createReadStream(tempFilePath),
        model: 'whisper-1',
        response_format: 'json',
      });

      console.log('Transcription response:', transcription);

      if (!transcription.text?.trim()) {
        return NextResponse.json(
          { 
            error: 'No transcription text received',
            details: 'No speech detected in audio'
          },
          { status: 200 } // Changed to 200 since this is an expected case
        );
      }

      return NextResponse.json({ text: transcription.text });
    } catch (transcriptionError) {
      console.error('OpenAI Transcription error:', transcriptionError);
      return NextResponse.json(
        { 
          error: 'Transcription failed', 
          details: transcriptionError instanceof Error ? transcriptionError.message : 'Unknown error'
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Request processing error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process request',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  } finally {
    // Clean up the temporary file
    if (tempFilePath) {
      try {
        await unlink(tempFilePath);
      } catch (error) {
        console.error('Error cleaning up temporary file:', error);
      }
    }
  }
} 