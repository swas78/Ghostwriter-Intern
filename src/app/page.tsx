'use client';

import { useState, useRef, useEffect } from 'react';
import styles from './page.module.css';
import { TaskCard, Task } from '@/components/TaskCard/TaskCard';

export default function Home() {
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [overflowCount, setOverflowCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const submitText = async () => {
    if (!inputText.trim()) return;
    
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
        body: JSON.stringify({ text: inputText }),
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
          disabled={isProcessing}
        />
        <div className={styles.inputFooter}>
          <button 
            className={`${styles.recordBtn} ${isRecording ? styles.recording : ''}`}
            onClick={() => setIsRecording(!isRecording)}
            disabled={isProcessing}
          >
            <span className={styles.recordIcon}>
              {isRecording && <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><rect x="6" y="6" width="12" height="12"></rect></svg>}
            </span>
            {isRecording ? 'Listening...' : 'Record voice note'}
          </button>
          
          <button className={styles.submitBtn} onClick={submitText} disabled={isProcessing || !inputText.trim()}>
            {isProcessing ? 'Processing...' : 'Sort my day'}
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
