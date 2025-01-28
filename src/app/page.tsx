'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

// Constants for audio processing
const SAMPLE_RATE = 16000;
const CHUNK_SIZE = 8192; // Increased for better accuracy
const PROCESSING_INTERVAL = 2000; // 2 seconds for better context
const MIN_AUDIO_LENGTH = 0.5; // Minimum audio length in seconds

export default function Home() {
  const [isListening, setIsListening] = useState(false);
  const [originalTranscription, setOriginalTranscription] = useState<Array<{ text: string; timestamp: number }>>([]);
  const [translation, setTranslation] = useState<Array<{ text: string; timestamp: number }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreenLeft, setIsFullscreenLeft] = useState(false);
  const [isFullscreenRight, setIsFullscreenRight] = useState(false);
  
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const processingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef<boolean>(false);

  // Add this useEffect for auto-scrolling
  const transcriptionContainerRef = useRef<HTMLDivElement>(null);
  const translationContainerRef = useRef<HTMLDivElement>(null);

  // Add new state for focused lines after the existing state declarations
  const [focusedOriginalIndex, setFocusedOriginalIndex] = useState<number | null>(null);
  const [focusedTranslationIndex, setFocusedTranslationIndex] = useState<number | null>(null);

  // Add new state for tracking live mode after the existing state declarations
  const [isLiveMode, setIsLiveMode] = useState(true);
  const [targetLanguage, setTargetLanguage] = useState('kha');
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const [languageError, setLanguageError] = useState<string | null>(null);
  const [isViewingHistory, setIsViewingHistory] = useState(false);
  const [fullSizePanel, setFullSizePanel] = useState<'left' | 'right' | null>(null);
  const [mobileView, setMobileView] = useState<'original' | 'en' | 'hi' | 'kha'>('original');
  const [isMobile, setIsMobile] = useState(false);

  const languages: { [key: string]: string } = {
    original: 'Original Language',
    en: 'English',
    hi: 'Hindi',
    kha: 'Khasi'
  };

  const waitingMessages = {
    en: 'Waiting for speech...',
    hi: 'भाषण की प्रतीक्षा कर रहा है...',
    kha: 'Dang ap ia ka jingkren...'
  };

  const mainRef = useRef<HTMLElement>(null);

  // Add fullscreen change detection
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreenLeft(document.fullscreenElement === leftPanelRef.current);
      setIsFullscreenRight(document.fullscreenElement === rightPanelRef.current);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = async (panelRef: React.RefObject<HTMLDivElement | null>, isFullscreen: boolean) => {
    try {
      if (!isFullscreen && panelRef.current) {
        await panelRef.current.requestFullscreen();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.error('Fullscreen error:', error);
    }
  };

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 640); // 640px is Tailwind's sm breakpoint
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (isLiveMode && transcriptionContainerRef.current && originalTranscription.length > 0) {
      const container = transcriptionContainerRef.current;
      const scrollHeight = container.scrollHeight;
      const height = container.clientHeight;
      // Add a small delay to ensure the DOM has updated
      requestAnimationFrame(() => {
        container.scrollTop = Math.max(0, scrollHeight - height / 2 - 50);
      });
    }
  }, [originalTranscription, isLiveMode]);

  useEffect(() => {
    if (isLiveMode && translationContainerRef.current && translation.length > 0) {
      const container = translationContainerRef.current;
      const scrollHeight = container.scrollHeight;
      const height = container.clientHeight;
      // Add a small delay to ensure the DOM has updated
      requestAnimationFrame(() => {
        container.scrollTop = Math.max(0, scrollHeight - height / 2 - 50);
      });
    }
  }, [translation, isLiveMode]);

  const convertToWav = (audioData: Float32Array[]): Blob => {
    // Concatenate all chunks
    const length = audioData.reduce((acc, chunk) => acc + chunk.length, 0);
    const samples = new Float32Array(length);
    let offset = 0;
    for (const chunk of audioData) {
      samples.set(chunk, offset);
      offset += chunk.length;
    }

    // Create WAV header
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, SAMPLE_RATE, true);
    view.setUint32(28, SAMPLE_RATE * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, samples.length * 2, true);

    // Write audio data
    const audioDataView = new Int16Array(buffer, 44);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      audioDataView[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  };

  const processAudio = useCallback(async (audioBlob: Blob) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    try {
      fetch('/api/whisper', {
        method: 'POST',
        body: (() => {
          const formData = new FormData();
          formData.append('audio', audioBlob, 'audio.wav');
          return formData;
        })(),
      })
      .then(async response => {
        if (!response.ok) {
          const data = await response.json();
          if (!data.details?.includes('No transcription text received')) {
            throw new Error(data.error || 'Transcription failed');
          }
          return;
        }
        const data = await response.json();
        if (data.text?.trim()) {
          const newText = data.text.trim();
          
          // Skip auto-generated responses during silence
          if (newText.toLowerCase() === 'thank you' || 
              newText.toLowerCase() === 'you' || 
              newText.toLowerCase().includes('. . .') ||
              newText.toLowerCase().includes('...') ||
              newText.toLowerCase().includes('thanks for watching') ||
              newText.toLowerCase().includes('subs by') ||
              newText.toLowerCase().includes('www.') ||
              newText.toLowerCase().includes('.co.uk')) {
            return;
          }
          
          setOriginalTranscription(prev => [...prev, { text: newText, timestamp: Date.now() }]);

          // Translate to Khasi
          fetch('/api/speech', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: newText,
              fromLang: 'auto',
              toLang: targetLanguage,
            }),
          })
          .then(res => {
            if (!res.ok) {
              return res.json().then(data => {
                throw new Error(data.error || 'Translation failed');
              });
            }
            return res.json();
          })
          .then(translationData => {
            console.log('Translation response:', { targetLanguage, translationData });
            if (translationData.translation?.trim()) {
              setTranslation(prev => [...prev, { text: translationData.translation, timestamp: Date.now() }]);
            } else {
              throw new Error('Empty translation received');
            }
          })
          .catch(error => {
            console.error('Translation error:', error);
            setError(`Translation error: ${error.message}`);
            setTimeout(() => setError(null), 3000);
          });
        }
      })
      .catch(error => {
        if (!error.message?.includes('No transcription text received')) {
          console.error('Transcription error:', error);
          setError(error.message);
        }
      });

      setError(null);
    } catch (error) {
      if (error instanceof Error && 
          !error.message.includes('No transcription text received')) {
        console.error('Processing error:', error);
        setError(error.message);
      }
    } finally {
      isProcessingRef.current = false;
    }
  }, [targetLanguage]);

  const startListening = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setOriginalTranscription([]);
      setTranslation([]);
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: SAMPLE_RATE,
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false
        } 
      });

      audioContextRef.current = new AudioContext({ sampleRate: SAMPLE_RATE });
      sourceNodeRef.current = audioContextRef.current.createMediaStreamSource(stream);
      processorRef.current = audioContextRef.current.createScriptProcessor(CHUNK_SIZE, 1, 1);
      chunksRef.current = [];

      processorRef.current.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        chunksRef.current.push(new Float32Array(inputData));
      };

      sourceNodeRef.current.connect(processorRef.current);
      processorRef.current.connect(audioContextRef.current.destination);

      processingIntervalRef.current = setInterval(() => {
        if (chunksRef.current.length > 0 && !isProcessingRef.current) {
          const audioLength = (chunksRef.current.length * CHUNK_SIZE) / SAMPLE_RATE;
          if (audioLength >= MIN_AUDIO_LENGTH) {
            const audioBlob = convertToWav(chunksRef.current);
            processAudio(audioBlob);
            chunksRef.current = [];
          }
        }
      }, PROCESSING_INTERVAL);

      setIsListening(true);
      setIsLoading(false);
    } catch (error) {
      console.error('Error starting recording:', error);
      setError('Failed to access microphone');
      setIsLoading(false);
    }
  };

  const stopListening = () => {
    if (processingIntervalRef.current) {
      clearInterval(processingIntervalRef.current);
    }

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Process any remaining audio
    if (chunksRef.current.length > 0) {
      const audioBlob = convertToWav(chunksRef.current);
      processAudio(audioBlob);
      chunksRef.current = [];
    }

    setIsListening(false);
  };

  useEffect(() => {
    return () => {
      if (processingIntervalRef.current) {
        clearInterval(processingIntervalRef.current);
      }
      if (processorRef.current) {
        processorRef.current.disconnect();
      }
      if (sourceNodeRef.current) {
        sourceNodeRef.current.disconnect();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Add scroll handlers
  const handleScroll = (container: HTMLDivElement) => {
    const { scrollTop, scrollHeight, clientHeight } = container;
    const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 50;
    setIsViewingHistory(!isAtBottom);
  };

  return (
    <main ref={mainRef} className="min-h-screen bg-[#121212] text-white p-8 max-sm:p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="grid grid-cols-3 items-center mb-6 max-sm:grid-cols-1 max-sm:gap-4 max-sm:mb-4">
          {/* Language Display/Selector for Mobile */}
          <div className="hidden max-sm:block w-full relative">
            <button 
              onClick={() => {
                if (isListening && mobileView !== 'original' && targetLanguage !== mobileView) {
                  setLanguageError('Stop the current session to change language');
                  setTimeout(() => setLanguageError(null), 3000);
                  return;
                }
                setIsLanguageMenuOpen(!isLanguageMenuOpen);
              }}
              className={`flex items-center justify-center gap-2 w-full text-xl transition-opacity ${
                isListening && mobileView !== 'original' && targetLanguage !== mobileView ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80'
              }`}
            >
              <span>{mobileView === 'original' ? 'Original Language' : languages[mobileView]}</span>
              <svg className={`w-5 h-5 fill-current transform transition-transform ${isLanguageMenuOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20">
                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/>
              </svg>
            </button>
            
            {languageError && (
              <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 bg-red-500 text-white px-3 py-1.5 rounded-lg text-sm whitespace-nowrap z-20">
                {languageError}
              </div>
            )}
            
            {isLanguageMenuOpen && (
              <div className="absolute left-0 right-0 mt-2 mx-4 bg-[#121212] rounded-lg shadow-lg py-2 z-10">
                <button
                  onClick={() => {
                    setMobileView('original');
                    setIsLanguageMenuOpen(false);
                  }}
                  className={`w-full px-4 py-2 text-center hover:bg-black transition-colors ${
                    mobileView === 'original' ? 'text-white' : 'text-gray-400'
                  }`}
                >
                  Original Language
                </button>
                {Object.entries(languages).map(([code, name]) => (
                  code !== 'original' && (
                    <button
                      key={code}
                      onClick={() => {
                        if (isListening && targetLanguage !== code) {
                          setLanguageError('Stop the current session to change language');
                          setTimeout(() => setLanguageError(null), 3000);
                          setIsLanguageMenuOpen(false);
                          return;
                        }
                        setMobileView(code as 'original' | 'en' | 'hi' | 'kha');
                        setTargetLanguage(code);
                        setIsLanguageMenuOpen(false);
                      }}
                      className={`w-full px-4 py-2 text-center hover:bg-black transition-colors ${
                        mobileView === code ? 'text-white' : 'text-gray-400'
                      } ${isListening && targetLanguage !== code ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {name}
                    </button>
                  )
                ))}
              </div>
            )}
          </div>

          {/* Desktop Header Items */}
          <div className="max-sm:hidden text-2xl">Original Language</div>
          
          {/* Center Button */}
          <div className="flex justify-center gap-4 max-sm:order-last">
            <button
              onClick={isListening ? stopListening : startListening}
              className="flex items-center gap-2 text-lg"
            >
              {isListening ? 'Stop Listening' : 'Start Listening'}
              {!isListening && (
                <svg className="w-5 h-5 fill-green-500" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
              {isListening && (
                <div className="w-3 h-3 rounded-full bg-red-500"/>
              )}
            </button>
          </div>

          {/* Desktop Language Selector */}
          <div className="max-sm:hidden flex justify-end items-center gap-2 relative">
            <button 
              onClick={() => {
                if (isListening) {
                  setLanguageError('Stop the current session to change language');
                  setTimeout(() => setLanguageError(null), 3000);
                  return;
                }
                setIsLanguageMenuOpen(!isLanguageMenuOpen);
              }}
              className={`flex items-center gap-2 transition-opacity ${
                isListening ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80'
              }`}
            >
              <span className="text-2xl">{languages[targetLanguage as keyof typeof languages]}</span>
              <svg className={`w-5 h-5 fill-current transform transition-transform ${isLanguageMenuOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20">
                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/>
              </svg>
            </button>
            
            {languageError && (
              <div className="absolute top-full right-0 mt-2 bg-red-500 text-white px-3 py-1.5 rounded-lg text-sm whitespace-nowrap z-20">
                {languageError}
              </div>
            )}
            
            {isLanguageMenuOpen && !isListening && (
              <div className="absolute top-full right-0 mt-2 bg-[#121212] rounded-lg shadow-lg py-2 min-w-[150px] z-10">
                {Object.entries(languages).map(([code, name]) => (
                  <button
                    key={code}
                    onClick={() => {
                      setTargetLanguage(code);
                      setIsLanguageMenuOpen(false);
                    }}
                    className={`w-full px-4 py-2 text-left hover:bg-black transition-colors ${
                      targetLanguage === code ? 'text-white' : 'text-gray-400'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Content Panels */}
        <div className={`grid ${fullSizePanel ? 'grid-cols-1' : 'grid-cols-2'} gap-8 max-sm:grid-cols-1 max-sm:gap-4`}>
          {/* Left Panel - Original */}
          {(!fullSizePanel || fullSizePanel === 'left') && (!isMobile || mobileView === 'original') && (
            <div ref={leftPanelRef} className={`bg-black rounded-[2rem] p-8 min-h-[600px] relative max-sm:p-4 max-sm:min-h-[400px] ${isFullscreenLeft ? 'fixed inset-0 z-50 rounded-none' : ''}`}>
              {/* Panel Controls */}
              <div className="absolute top-4 right-4 flex gap-2">
                {/* All Panel Controls - Hide on mobile */}
                {!isMobile && (
                  <>
                    {/* Fullscreen Button */}
                    <button
                      onClick={() => toggleFullscreen(leftPanelRef, isFullscreenLeft)}
                      className="text-gray-400 hover:text-white transition-colors"
                      title={isFullscreenLeft ? "Exit Fullscreen" : "Enter Fullscreen"}
                    >
                      {isFullscreenLeft ? (
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                        </svg>
                      )}
                    </button>
                    {/* Expand Panel Button */}
                    {!isFullscreenLeft && (
                      <button
                        onClick={() => setFullSizePanel(fullSizePanel === 'left' ? null : 'left')}
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        {fullSizePanel === 'left' ? (
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M4 8V4m0 0h4M4 4l5 5m11-5v4m0-4h-4m4 4l-5-5m-11 13v-4m0 4h4m-4-4l5 5m11-5v4m0-4h-4m4 4l-5-5" />
                          </svg>
                        )}
                      </button>
                    )}
                  </>
                )}
              </div>
              <div 
                ref={transcriptionContainerRef}
                className="h-[500px] overflow-y-auto scrollbar-hide max-sm:h-[350px]"
                onScroll={(e) => handleScroll(e.currentTarget)}
                style={{
                  scrollBehavior: 'smooth',
                  maskImage: 'linear-gradient(to bottom, transparent, black 20%, black 80%, transparent 100%)',
                  WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 20%, black 80%, transparent 100%)'
                }}
              >
                <div className="space-y-2 py-[250px] max-sm:py-[175px]">
                  {isLoading ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-600 border-t-white"></div>
                    </div>
                  ) : originalTranscription.length > 0 ? (
                    originalTranscription.map((line, index) => {
                      const isLatest = index === originalTranscription.length - 1;
                      const isFocused = focusedOriginalIndex === index;
                      const opacity = isViewingHistory ? 100 : (isLatest || isFocused ? 100 : Math.max(30, 100 - (originalTranscription.length - 1 - index) * 20));
                      return (
                        <div
                          key={line.timestamp}
                          className={`py-1 transition-all duration-500 text-center cursor-pointer`}
                          style={{ opacity: `${opacity}%` }}
                          onClick={() => {
                            setFocusedOriginalIndex(index);
                            setFocusedTranslationIndex(index);
                            setIsLiveMode(false);
                            // Scroll both panels to the clicked line
                            if (transcriptionContainerRef.current && translationContainerRef.current) {
                              const elements = transcriptionContainerRef.current.getElementsByClassName('line-item');
                              const targetElement = elements[index];
                              if (targetElement) {
                                const container = transcriptionContainerRef.current;
                                const elementRect = targetElement.getBoundingClientRect();
                                const containerRect = container.getBoundingClientRect();
                                const scrollTop = container.scrollTop + (elementRect.top - containerRect.top) - (containerRect.height / 2);
                                container.scrollTo({ top: scrollTop, behavior: 'smooth' });
                              }
                              // Scroll translation panel to matching line
                              const translationElements = translationContainerRef.current.getElementsByClassName('line-item');
                              const targetTranslationElement = translationElements[index];
                              if (targetTranslationElement) {
                                const container = translationContainerRef.current;
                                const elementRect = targetTranslationElement.getBoundingClientRect();
                                const containerRect = container.getBoundingClientRect();
                                const scrollTop = container.scrollTop + (elementRect.top - containerRect.top) - (containerRect.height / 2);
                                container.scrollTo({ top: scrollTop, behavior: 'smooth' });
                              }
                            }
                          }}
                        >
                          <p className={`${isLatest || isFocused ? 'text-white text-2xl' : 'text-gray-400'} line-item`}>
                            {line.text}
                          </p>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center">Waiting for speech...</div>
                  )}
                </div>
              </div>
              {!isLiveMode && (
                <button
                  onClick={() => {
                    setIsLiveMode(true);
                    setFocusedOriginalIndex(null);
                    setFocusedTranslationIndex(null);
                    // Immediately scroll to latest content when returning to live mode
                    if (transcriptionContainerRef.current && originalTranscription.length > 0) {
                      const container = transcriptionContainerRef.current;
                      const scrollHeight = container.scrollHeight;
                      const height = container.clientHeight;
                      container.scrollTop = Math.max(0, scrollHeight - height / 2 - 50);
                    }
                    if (translationContainerRef.current && translation.length > 0) {
                      const container = translationContainerRef.current;
                      const scrollHeight = container.scrollHeight;
                      const height = container.clientHeight;
                      container.scrollTop = Math.max(0, scrollHeight - height / 2 - 50);
                    }
                  }}
                  className="absolute bottom-4 right-4 flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors bg-[#121212] px-3 py-1.5 rounded-lg sm:text-xs"
                >
                  Return to Live
                  <svg className="w-4 h-4 fill-red-500" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* Right Panel - Translation */}
          {(!fullSizePanel || fullSizePanel === 'right') && (!isMobile || mobileView !== 'original') && (
            <div ref={rightPanelRef} className={`bg-black rounded-[2rem] p-8 min-h-[600px] relative max-sm:p-4 max-sm:min-h-[400px] ${isFullscreenRight ? 'fixed inset-0 z-50 rounded-none' : ''}`}>
              {/* Panel Controls */}
              <div className="absolute top-4 right-4 flex gap-2">
                {/* All Panel Controls - Hide on mobile */}
                {!isMobile && (
                  <>
                    {/* Fullscreen Button */}
                    <button
                      onClick={() => toggleFullscreen(rightPanelRef, isFullscreenRight)}
                      className="text-gray-400 hover:text-white transition-colors"
                      title={isFullscreenRight ? "Exit Fullscreen" : "Enter Fullscreen"}
                    >
                      {isFullscreenRight ? (
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                        </svg>
                      )}
                    </button>
                    {/* Expand Panel Button */}
                    {!isFullscreenRight && (
                      <button
                        onClick={() => setFullSizePanel(fullSizePanel === 'right' ? null : 'right')}
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        {fullSizePanel === 'right' ? (
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M4 8V4m0 0h4M4 4l5 5m11-5v4m0-4h-4m4 4l-5-5m-11 13v-4m0 4h4m-4-4l5 5m11-5v4m0-4h-4m4 4l-5-5" />
                          </svg>
                        )}
                      </button>
                    )}
                  </>
                )}
              </div>
              <div 
                ref={translationContainerRef}
                className="h-[500px] overflow-y-auto scrollbar-hide max-sm:h-[350px]"
                onScroll={(e) => handleScroll(e.currentTarget)}
                style={{
                  scrollBehavior: 'smooth',
                  maskImage: 'linear-gradient(to bottom, transparent, black 20%, black 80%, transparent 100%)',
                  WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 20%, black 80%, transparent 100%)'
                }}
              >
                <div className="space-y-2 py-[250px] max-sm:py-[175px]">
                  {isLoading ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-600 border-t-white"></div>
                    </div>
                  ) : translation.length > 0 ? (
                    translation.map((line, index) => {
                      const isLatest = index === translation.length - 1;
                      const isFocused = focusedTranslationIndex === index;
                      const opacity = isViewingHistory ? 100 : (isLatest || isFocused ? 100 : Math.max(30, 100 - (translation.length - 1 - index) * 20));
                      return (
                        <div
                          key={line.timestamp}
                          className={`py-1 transition-all duration-500 text-center cursor-pointer`}
                          style={{ opacity: `${opacity}%` }}
                          onClick={() => {
                            setFocusedTranslationIndex(index);
                            setFocusedOriginalIndex(index);
                            setIsLiveMode(false);
                            // Scroll both panels to the clicked line
                            if (translationContainerRef.current && transcriptionContainerRef.current) {
                              const elements = translationContainerRef.current.getElementsByClassName('line-item');
                              const targetElement = elements[index];
                              if (targetElement) {
                                const container = translationContainerRef.current;
                                const elementRect = targetElement.getBoundingClientRect();
                                const containerRect = container.getBoundingClientRect();
                                const scrollTop = container.scrollTop + (elementRect.top - containerRect.top) - (containerRect.height / 2);
                                container.scrollTo({ top: scrollTop, behavior: 'smooth' });
                              }
                              // Scroll original panel to matching line
                              const originalElements = transcriptionContainerRef.current.getElementsByClassName('line-item');
                              const targetOriginalElement = originalElements[index];
                              if (targetOriginalElement) {
                                const container = transcriptionContainerRef.current;
                                const elementRect = targetOriginalElement.getBoundingClientRect();
                                const containerRect = container.getBoundingClientRect();
                                const scrollTop = container.scrollTop + (elementRect.top - containerRect.top) - (containerRect.height / 2);
                                container.scrollTo({ top: scrollTop, behavior: 'smooth' });
                              }
                            }
                          }}
                        >
                          <p className={`${isLatest || isFocused ? 'text-white text-2xl' : 'text-gray-400'} line-item`}>
                            {line.text}
                          </p>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center">{waitingMessages[targetLanguage as keyof typeof waitingMessages]}</div>
                  )}
                </div>
              </div>
              {!isLiveMode && (
                <button
                  onClick={() => {
                    setIsLiveMode(true);
                    setFocusedOriginalIndex(null);
                    setFocusedTranslationIndex(null);
                    // Immediately scroll to latest content when returning to live mode
                    if (transcriptionContainerRef.current && originalTranscription.length > 0) {
                      const container = transcriptionContainerRef.current;
                      const scrollHeight = container.scrollHeight;
                      const height = container.clientHeight;
                      container.scrollTop = Math.max(0, scrollHeight - height / 2 - 50);
                    }
                    if (translationContainerRef.current && translation.length > 0) {
                      const container = translationContainerRef.current;
                      const scrollHeight = container.scrollHeight;
                      const height = container.clientHeight;
                      container.scrollTop = Math.max(0, scrollHeight - height / 2 - 50);
                    }
                  }}
                  className="absolute bottom-4 right-4 flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors bg-[#121212] px-3 py-1.5 rounded-lg sm:text-xs"
                >
                  Return to Live
                  <svg className="w-4 h-4 fill-red-500" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && error !== 'Stop the current session to change language' && (
          <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 max-sm:w-[90%]">
            <div className="bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg text-center">
              {error}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
