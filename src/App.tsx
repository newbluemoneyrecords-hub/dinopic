import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Upload, Image as ImageIcon, Film, Download, Wand2, Sparkles, Settings, Loader2, Play, AlertCircle, RefreshCw, AlignLeft, Replace, SlidersHorizontal } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Types
type Tab = 'edit' | 'generate';

// Helper to get base64 from File
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

const getApiKey = () => {
  try {
    // @ts-ignore
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) return process.env.API_KEY;
    // @ts-ignore
    if (typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  } catch (e) {}
  return '';
};

export default function App() {
  const [hasKey, setHasKey] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('edit');
  
  // Edit State
  const [sourceImage, setSourceImage] = useState<{ file: File; base64: string; mimeType: string; url: string } | null>(null);
  const [editedImage, setEditedImage] = useState<{ base64: string; mimeType: string; url: string } | null>(null);
  const [generatedVideo, setGeneratedVideo] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [videoStatus, setVideoStatus] = useState<string>('');

  // Analysis State
  const [imageCaption, setImageCaption] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Swap State
  const [swapTarget, setSwapTarget] = useState('');
  const [swapReplacement, setSwapReplacement] = useState('');
  
  // Maxout State
  const [maxoutIntensity, setMaxoutIntensity] = useState(5);

  // Generate State
  const [genPrompt, setGenPrompt] = useState('');
  const [genSize, setGenSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [genRatio, setGenRatio] = useState<'1:1' | '3:4' | '4:3' | '9:16' | '16:9'>('1:1');
  const [generatedImage, setGeneratedImage] = useState<{ base64: string; mimeType: string; url: string } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkKey = async () => {
      if ((window as any).aistudio?.hasSelectedApiKey) {
        const selected = await (window as any).aistudio.hasSelectedApiKey();
        setHasKey(selected);
      } else {
        // Fallback for local dev
        setHasKey(true);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if ((window as any).aistudio?.openSelectKey) {
      await (window as any).aistudio.openSelectKey();
      setHasKey(true);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      try {
        const base64 = await fileToBase64(file);
        const url = URL.createObjectURL(file);
        setSourceImage({ file, base64, mimeType: file.type, url });
        setEditedImage(null);
        setGeneratedVideo(null);
        setEditError(null);
        setImageCaption(null);
        setSwapTarget('');
        setSwapReplacement('');
        setMaxoutIntensity(5);
      } catch (err) {
        console.error("Error reading file:", err);
        setEditError("Failed to read image file.");
      }
    }
  };

  const handleEdit = async (prompt: string) => {
    if (!sourceImage) return;
    setIsEditing(true);
    setEditError(null);
    
    try {
      const ai = new GoogleGenAI({});
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: {
          parts: [
            {
              inlineData: {
                data: sourceImage.base64,
                mimeType: sourceImage.mimeType,
              },
            },
            {
              text: prompt,
            },
          ],
        },
      });
      
      let foundImage = false;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const base64 = part.inlineData.data;
          const mimeType = part.inlineData.mimeType || 'image/png';
          const url = `data:${mimeType};base64,${base64}`;
          setEditedImage({ base64, mimeType, url });
          foundImage = true;
          break;
        }
      }
      
      if (!foundImage) {
        throw new Error("No image returned from the model.");
      }
    } catch (err: any) {
      console.error("Edit error:", err);
      setEditError(err.message || "Failed to edit image.");
    } finally {
      setIsEditing(false);
    }
  };

  const handleAnimate = async () => {
    const targetImage = editedImage || sourceImage;
    if (!targetImage) return;
    
    setIsAnimating(true);
    setEditError(null);
    setVideoStatus('Initializing video generation...');
    
    try {
      const ai = new GoogleGenAI({});
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: 'Animate this image, bringing the scene to life with natural motion.',
        image: {
          imageBytes: targetImage.base64,
          mimeType: targetImage.mimeType,
        },
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '16:9'
        }
      });
      
      while (!operation.done) {
        setVideoStatus('Generating video... This may take a few minutes.');
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await ai.operations.getVideosOperation({operation: operation});
      }
      
      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (!downloadLink) {
        throw new Error("No video URI returned.");
      }
      
      setVideoStatus('Downloading video...');
      
      const apiKey = getApiKey();
      const response = await fetch(downloadLink, {
        method: 'GET',
        headers: {
          'x-goog-api-key': apiKey,
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch video: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setGeneratedVideo(url);
      setVideoStatus('');
    } catch (err: any) {
      console.error("Animate error:", err);
      setEditError(err.message || "Failed to animate image.");
      setVideoStatus('');
    } finally {
      setIsAnimating(false);
    }
  };

  const handleAnalyze = async () => {
    if (!sourceImage) return;
    setIsAnalyzing(true);
    setEditError(null);
    try {
      const ai = new GoogleGenAI({});
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: [
          {
            inlineData: {
              data: sourceImage.base64,
              mimeType: sourceImage.mimeType,
            }
          },
          "Analyze this image and generate a detailed descriptive text caption capturing the main subjects, actions, and overall mood."
        ]
      });
      setImageCaption(response.text || "No description generated.");
    } catch (err: any) {
      console.error("Analysis error:", err);
      setEditError(err.message || "Failed to analyze image.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSwap = () => {
    if (!swapTarget || !swapReplacement) return;
    handleEdit(`Replace the ${swapTarget} with a ${swapReplacement}. The new object should realistically blend into the scene, considering lighting and perspective.`);
  };

  const handleMaxout = () => {
    handleEdit(`Apply a MAXOUT filter with intensity ${maxoutIntensity}/10: Add abc's and numbers 123 to the image in realistic bubble font, and add a realistic metal to the image with glowing light integrated seamlessly so it looks like it belongs in the scene.`);
  };

  const handleGenerate = async () => {
    if (!genPrompt) return;
    setIsGenerating(true);
    setGenError(null);
    
    try {
      const ai = new GoogleGenAI({});
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
          parts: [
            { text: genPrompt }
          ]
        },
        config: {
          imageConfig: {
            aspectRatio: genRatio,
            imageSize: genSize
          }
        }
      });
      
      let foundImage = false;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const base64 = part.inlineData.data;
          const mimeType = part.inlineData.mimeType || 'image/png';
          const url = `data:${mimeType};base64,${base64}`;
          setGeneratedImage({ base64, mimeType, url });
          foundImage = true;
          break;
        }
      }
      
      if (!foundImage) {
        throw new Error("No image returned from the model.");
      }
    } catch (err: any) {
      console.error("Generate error:", err);
      setGenError(err.message || "Failed to generate image.");
    } finally {
      setIsGenerating(false);
    }
  };

  if (!hasKey) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 font-sans text-zinc-100">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center shadow-2xl"
        >
          <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-6">
            <Sparkles size={32} />
          </div>
          <h1 className="text-3xl font-medium tracking-tight mb-3">Welcome to DinoEdit</h1>
          <p className="text-zinc-400 mb-8">
            Connect your Google Cloud project to unlock AI-powered image editing, generation, and video animation.
          </p>
          <button 
            onClick={handleSelectKey}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-medium py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <Settings size={20} />
            Connect API Key
          </button>
          <p className="text-xs text-zinc-500 mt-6">
            Requires a paid Google Cloud project with Gemini API enabled.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-zinc-950">
              <Sparkles size={18} />
            </div>
            <h1 className="text-xl font-medium tracking-tight">DinoEdit Studio</h1>
          </div>
          <div className="flex bg-zinc-900 p-1 rounded-lg border border-zinc-800">
            <button 
              onClick={() => setActiveTab('edit')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'edit' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              Edit & Animate
            </button>
            <button 
              onClick={() => setActiveTab('generate')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'generate' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              Generate
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          {activeTab === 'edit' ? (
            <motion.div 
              key="edit"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8"
            >
              {/* Left Column: Canvas/Preview */}
              <div className="lg:col-span-8 space-y-6">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden min-h-[600px] flex flex-col relative shadow-xl">
                  {/* Toolbar */}
                  <div className="h-12 border-b border-zinc-800 flex items-center px-4 justify-between bg-zinc-900/80 backdrop-blur-sm z-10">
                    <div className="flex items-center gap-2 text-sm text-zinc-400 font-mono">
                      <ImageIcon size={16} />
                      <span>Preview</span>
                    </div>
                    {(editedImage || sourceImage) && (
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            setSourceImage(null);
                            setEditedImage(null);
                            setGeneratedVideo(null);
                          }}
                          className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors"
                          title="Clear"
                        >
                          <RefreshCw size={16} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Canvas Area */}
                  <div className="flex-1 flex items-center justify-center p-6 bg-zinc-950/50 relative">
                    {!sourceImage ? (
                      <div 
                        className="w-full max-w-md border-2 border-dashed border-zinc-700 rounded-xl p-12 text-center hover:bg-zinc-800/50 hover:border-zinc-500 transition-all cursor-pointer group"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                          <Upload size={24} className="text-zinc-400 group-hover:text-emerald-400 transition-colors" />
                        </div>
                        <h3 className="text-lg font-medium mb-2">Upload an Image</h3>
                        <p className="text-sm text-zinc-500">Drag and drop or click to browse</p>
                        <input 
                          type="file" 
                          ref={fileInputRef} 
                          onChange={handleImageUpload} 
                          accept="image/*" 
                          className="hidden" 
                        />
                      </div>
                    ) : (
                      <div className="relative w-full h-full flex items-center justify-center">
                        {generatedVideo ? (
                          <video 
                            src={generatedVideo} 
                            controls 
                            autoPlay 
                            loop 
                            className="max-w-full max-h-[600px] rounded-lg shadow-2xl"
                          />
                        ) : (
                          <img 
                            src={editedImage?.url || sourceImage.url} 
                            alt="Preview" 
                            className="max-w-full max-h-[600px] object-contain rounded-lg shadow-2xl"
                            referrerPolicy="no-referrer"
                          />
                        )}
                        
                        {/* Loading Overlays */}
                        {(isEditing || isAnimating) && (
                          <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm rounded-lg flex flex-col items-center justify-center text-emerald-400">
                            <Loader2 size={48} className="animate-spin mb-4" />
                            <p className="font-medium">{isEditing ? 'Applying AI Magic...' : videoStatus}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Error Display */}
                {editError && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl flex items-start gap-3">
                    <AlertCircle size={20} className="shrink-0 mt-0.5" />
                    <p className="text-sm">{editError}</p>
                  </div>
                )}
              </div>

              {/* Right Column: Controls */}
              <div className="lg:col-span-4 space-y-6">
                {/* Image Analysis Panel */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
                  <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                    <AlignLeft size={20} className="text-emerald-400" />
                    Image Analysis
                  </h2>
                  {!imageCaption ? (
                    <button 
                      onClick={handleAnalyze}
                      disabled={!sourceImage || isAnalyzing}
                      className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-left px-4 py-3 rounded-xl transition-colors text-sm font-medium flex items-center justify-center gap-2"
                    >
                      {isAnalyzing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                      {isAnalyzing ? 'Analyzing...' : 'Generate Description'}
                    </button>
                  ) : (
                    <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-sm text-zinc-300 leading-relaxed">
                      {imageCaption}
                    </div>
                  )}
                </div>

                {/* Image Editing Panel */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
                  <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                    <Wand2 size={20} className="text-emerald-400" />
                    AI Edits
                  </h2>
                  
                  <div className="space-y-3 mb-6">
                    <button 
                      onClick={() => handleEdit("Add realistic dinosaurs to the image, blending them naturally into the environment.")}
                      disabled={!sourceImage || isEditing || isAnimating}
                      className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-left px-4 py-3 rounded-xl transition-colors text-sm font-medium"
                    >
                      🦖 Add Dinosaurs
                    </button>
                    <button 
                      onClick={() => handleEdit("Add a flying pterodactyl or dinosaur in the sky, blending naturally.")}
                      disabled={!sourceImage || isEditing || isAnimating}
                      className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-left px-4 py-3 rounded-xl transition-colors text-sm font-medium"
                    >
                      🦅 Add Flying Dinosaur
                    </button>
                    <button 
                      onClick={() => handleEdit("Add a person standing next to a dinosaur, looking realistic.")}
                      disabled={!sourceImage || isEditing || isAnimating}
                      className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-left px-4 py-3 rounded-xl transition-colors text-sm font-medium"
                    >
                      🧍 Add Person & Dinosaur
                    </button>
                  </div>

                  {/* Object Swap */}
                  <div className="space-y-2 mb-6 pt-4 border-t border-zinc-800">
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1"><Replace size={14} /> Object Swap</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={swapTarget}
                        onChange={(e) => setSwapTarget(e.target.value)}
                        placeholder="Object to replace (e.g., bench)"
                        disabled={!sourceImage || isEditing || isAnimating}
                        className="w-1/2 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-50"
                      />
                      <input 
                        type="text" 
                        value={swapReplacement}
                        onChange={(e) => setSwapReplacement(e.target.value)}
                        placeholder="Replacement (e.g., dinosaur)"
                        disabled={!sourceImage || isEditing || isAnimating}
                        className="w-1/2 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-50"
                      />
                    </div>
                    <button 
                      onClick={handleSwap}
                      disabled={!sourceImage || !swapTarget || !swapReplacement || isEditing || isAnimating}
                      className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors mt-2"
                    >
                      Swap Object
                    </button>
                  </div>

                  {/* MAXOUT Filter */}
                  <div className="space-y-2 mb-6 pt-4 border-t border-zinc-800">
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1"><SlidersHorizontal size={14} /> MAXOUT Filter</label>
                    <div className="flex items-center gap-4 mb-2">
                      <span className="text-xs text-zinc-400">Intensity: {maxoutIntensity}</span>
                      <input 
                        type="range" 
                        min="1" 
                        max="10" 
                        value={maxoutIntensity}
                        onChange={(e) => setMaxoutIntensity(parseInt(e.target.value))}
                        disabled={!sourceImage || isEditing || isAnimating}
                        className="flex-1 accent-emerald-500"
                      />
                    </div>
                    <button 
                      onClick={handleMaxout}
                      disabled={!sourceImage || isEditing || isAnimating}
                      className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                    >
                      Apply MAXOUT
                    </button>
                  </div>

                  <div className="space-y-2 pt-4 border-t border-zinc-800">
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Custom Prompt</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        placeholder="e.g., Make it look like a cartoon..."
                        disabled={!sourceImage || isEditing || isAnimating}
                        className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-50"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && customPrompt) {
                            handleEdit(customPrompt);
                          }
                        }}
                      />
                      <button 
                        onClick={() => handleEdit(customPrompt)}
                        disabled={!sourceImage || !customPrompt || isEditing || isAnimating}
                        className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                </div>

                {/* Video Animation Panel */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
                  <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                    <Film size={20} className="text-emerald-400" />
                    Animate
                  </h2>
                  <p className="text-sm text-zinc-400 mb-4">
                    Turn your edited image into a high-quality video using Veo.
                  </p>
                  <button 
                    onClick={handleAnimate}
                    disabled={!sourceImage || isEditing || isAnimating}
                    className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    {isAnimating ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
                    {isAnimating ? 'Generating Video...' : 'Turn into Video'}
                  </button>
                </div>

                {/* Export Panel */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
                  <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                    <Download size={20} className="text-emerald-400" />
                    Export
                  </h2>
                  <div className="space-y-3">
                    <a 
                      href={editedImage?.url || sourceImage?.url || '#'} 
                      download="dino-edit.png"
                      className={`block w-full text-center border border-zinc-700 hover:bg-zinc-800 py-2.5 rounded-xl transition-colors text-sm font-medium ${(!sourceImage || isEditing || isAnimating) ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                      Download Image
                    </a>
                    <a 
                      href={generatedVideo || '#'} 
                      download="dino-video.mp4"
                      className={`block w-full text-center border border-zinc-700 hover:bg-zinc-800 py-2.5 rounded-xl transition-colors text-sm font-medium ${(!generatedVideo || isEditing || isAnimating) ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                      Download Video
                    </a>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="generate"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-3xl mx-auto space-y-8"
            >
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-xl">
                <h2 className="text-2xl font-medium mb-6 flex items-center gap-3">
                  <Sparkles size={28} className="text-emerald-400" />
                  Generate New Image
                </h2>
                
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">Prompt</label>
                    <textarea 
                      value={genPrompt}
                      onChange={(e) => setGenPrompt(e.target.value)}
                      placeholder="Describe the image you want to generate... e.g., A cinematic shot of a T-Rex walking through a modern city street at night, neon lights reflecting on wet pavement."
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-sm focus:outline-none focus:border-emerald-500 transition-colors min-h-[120px] resize-y"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-2">Size</label>
                      <select 
                        value={genSize}
                        onChange={(e) => setGenSize(e.target.value as any)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors appearance-none"
                      >
                        <option value="1K">1K (Standard)</option>
                        <option value="2K">2K (High)</option>
                        <option value="4K">4K (Ultra)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-2">Aspect Ratio</label>
                      <select 
                        value={genRatio}
                        onChange={(e) => setGenRatio(e.target.value as any)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors appearance-none"
                      >
                        <option value="1:1">1:1 (Square)</option>
                        <option value="4:3">4:3 (Landscape)</option>
                        <option value="16:9">16:9 (Widescreen)</option>
                        <option value="3:4">3:4 (Portrait)</option>
                        <option value="9:16">9:16 (Vertical)</option>
                      </select>
                    </div>
                  </div>

                  <button 
                    onClick={handleGenerate}
                    disabled={!genPrompt || isGenerating}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-4 px-6 rounded-xl transition-colors flex items-center justify-center gap-2 text-lg"
                  >
                    {isGenerating ? <Loader2 size={24} className="animate-spin" /> : <Wand2 size={24} />}
                    {isGenerating ? 'Generating...' : 'Generate Image'}
                  </button>
                  
                  {genError && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl flex items-start gap-3">
                      <AlertCircle size={20} className="shrink-0 mt-0.5" />
                      <p className="text-sm">{genError}</p>
                    </div>
                  )}
                </div>
              </div>

              {generatedImage && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium">Result</h3>
                    <a 
                      href={generatedImage.url} 
                      download="generated-image.png"
                      className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      <Download size={16} />
                      Download
                    </a>
                  </div>
                  <div className="rounded-xl overflow-hidden bg-zinc-950 flex items-center justify-center p-4">
                    <img 
                      src={generatedImage.url} 
                      alt="Generated" 
                      className="max-w-full max-h-[600px] object-contain rounded-lg shadow-2xl"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
