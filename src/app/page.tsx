'use client';

import { useState, useRef } from 'react';
import styles from './page.module.css';
import { TaskCard, Task } from '@/components/TaskCard/TaskCard';

export default function Home() {
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [overflowCount, setOverflowCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await handleAudioUpload(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (e) {
      console.error("Error accessing microphone", e);
      alert("Could not access microphone.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleAudioUpload = async (audioBlob: Blob) => {
    setIsProcessing(true);
    
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });
      
      const data = await res.json();
      if (data.text) {
        setInputText(data.text);
        await submitText(data.text);
      } else {
        alert("Transcription failed or returned no text.");
        setIsProcessing(false);
      }
    } catch (e) {
      console.error("Audio upload error", e);
      alert("Error transcribing audio.");
      setIsProcessing(false);
    }
  };

  const submitText = async (overrideText?: string) => {
    const textToProcess = overrideText || inputText;
    if (!textToProcess.trim()) return;
    
    setTasks([]); 
    setOverflowCount(0);
    setIsProcessing(true);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/process-dump', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToProcess }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; 
        
        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr) {
              try {
                const data = JSON.parse(dataStr);
                handleStreamEvent(currentEvent, data);
              } catch (e) {
                console.error("Error parsing stream data", e);
              }
            }
          }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error(e);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStreamEvent = (event: string, data: any) => {
    if (event === 'extracted') {
      const initTasks = data.items.map((i: any) => ({
        ...i,
        status: 'drafting'
      }));
      setTasks(initTasks);
      setOverflowCount(data.overflow || 0);
    } else if (event === 'drafted') {
      setTasks(prev => prev.map(t => 
        t.id === data.id ? { 
          ...t, 
          status: 'ready', 
          draft: data.draft, 
          toneLabel: data.toneLabel, 
          confidence: data.confidence 
        } : t
      ));
    } else if (event === 'draft_error') {
      setTasks(prev => prev.map(t => 
        t.id === data.id ? { ...t, status: 'error' } : t
      ));
    }
  };

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Ghostwriter Intern</h1>
        <p className={styles.subtitle}>Say your day out loud. Wake up to a done inbox.</p>
      </header>

      <section className={styles.inputSection}>
        <textarea
          className={styles.textarea}
          placeholder="Say your day out loud, or paste the mess here..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          disabled={isProcessing || isRecording}
        />
        <div className={styles.inputFooter}>
          <button 
            className={`${styles.recordBtn} ${isRecording ? styles.recording : ''}`}
            onClick={toggleRecording}
            disabled={isProcessing && !isRecording}
          >
            <span className={styles.recordIcon}></span>
            {isRecording ? 'Listening...' : 'Record voice note'}
          </button>
          
          <button 
            className={styles.submitBtn} 
            onClick={() => submitText()} 
            disabled={isProcessing || isRecording || !inputText.trim()}
          >
            {isProcessing && tasks.length === 0 ? 'Reading...' : 'Sort my day'}
          </button>
        </div>
      </section>

      {(tasks.length > 0 || isProcessing) && (
        <section className={styles.queueSection}>
          <div className={styles.queueHeader}>
            <h2 className={styles.queueTitle}>
              {isProcessing && tasks.length === 0 ? 'Reading through your day...' : 'Approval Queue'}
            </h2>
            {tasks.length > 0 && (
              <span className={styles.queueCount}>{tasks.filter(t => t.status === 'ready').length} ready</span>
            )}
          </div>
          
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}

          {overflowCount > 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '1rem' }}>
              + {overflowCount} more items found. Process the queue to see them.
            </div>
          )}
        </section>
      )}
    </main>
  );
}
