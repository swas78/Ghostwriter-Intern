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
  const [streak, setStreak] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const mainInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Auto-focus on mount
    mainInputRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      // Check Cmd+K (Mac) or Ctrl+K (Windows)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        const active = document.activeElement;
        // Don't steal focus if they are already in an input/textarea somewhere else
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable)) {
          if (active !== mainInputRef.current) {
            return;
          }
        }
        
        e.preventDefault();
        mainInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const getLocalToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const fetchStreak = async () => {
    try {
      const res = await fetch(`/api/activity?local_today=${getLocalToday()}`);
      const data = await res.json();
      if (data.streak !== undefined) {
        setStreak(data.streak);
      }
    } catch (e) {
      console.error('Failed to fetch streak', e);
    }
  };

  const logActivity = async () => {
    try {
      await fetch('/api/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ local_today: getLocalToday() })
      });
      fetchStreak();
    } catch (e) {
      console.error('Failed to log activity', e);
    }
  };
  
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

  const fetchTasks = async () => {
    try {
      const res = await fetch(`/api/tasks?local_today=${getLocalToday()}`);
      const data = await res.json();
      if (data.tasks) {
        setTasks(data.tasks.map((t: any) => ({
          ...t,
          status: t.status === 'drafted' ? 'drafted' : (t.status === 'pending' ? 'drafting' : t.status),
          isFollowUp: t.archived === 1
        })));
        
        // Auto-draft any pending tasks
        const pendingTasks = data.tasks.filter((t: any) => t.status === 'pending');
        if (pendingTasks.length > 0) {
          processDrafts(pendingTasks);
        }
      }
    } catch (e) {
      console.error("Failed to load tasks", e);
    }
  };

  useEffect(() => {
    fetchTasks();
    fetchStreak();
  }, []);

  const handleArchive = async (id: string, draft?: string, followUpDays?: number) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    try {
      const payload: any = { id, archived: true };
      if (draft !== undefined) {
        payload.draft = draft;
      }
      if (followUpDays !== undefined && followUpDays > 0) {
        const d = new Date();
        d.setDate(d.getDate() + followUpDays);
        payload.follow_up_date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (draft !== undefined) {
        logActivity();
      }
    } catch (e) {
      console.error("Failed to archive task", e);
    }
  };

  const handleDismiss = async (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    try {
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, follow_up_dismissed: true })
      });
    } catch (e) {
      console.error("Failed to dismiss follow-up", e);
    }
  };

  const handleRetry = async (id: string) => {
    const taskToRetry = tasks.find(t => t.id === id);
    if (!taskToRetry) return;

    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'drafting' } : t));
    
    try {
      const draftRes = await fetch('/api/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: taskToRetry }),
      });
      
      const draftData = await draftRes.json();
      
      setTasks(prev => prev.map(t => 
        t.id === id ? { 
          ...t, 
          status: draftData.status === 'error' ? 'error' : 'drafted', 
          draft: draftData.draft, 
          toneLabel: draftData.toneLabel, 
          confidence: draftData.confidence 
        } : t
      ));
    } catch (e) {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'error' } : t));
    }
  };

  const handleRefine = async (id: string, instruction: string) => {
    const taskToRefine = tasks.find(t => t.id === id);
    if (!taskToRefine) return;

    // Set to drafting while in-flight (disables Refine button)
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'drafting' } : t));
    
    try {
      const draftRes = await fetch('/api/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: taskToRefine, refine_instruction: instruction, simulate_parse_failure: instruction === 'fail' }),
      });
      
      const draftData = await draftRes.json();
      
      if (!draftRes.ok) {
        // Fallback to drafted (last known good draft) without overwriting
        setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'drafted' } : t));
        alert(draftData.error || 'Refinement failed.');
        return;
      }
      
      // Success, overwrite with new draft
      setTasks(prev => prev.map(t => 
        t.id === id ? { 
          ...t, 
          status: draftData.status === 'error' ? 'error' : 'drafted', 
          draft: draftData.draft, 
          toneLabel: draftData.toneLabel, 
          confidence: draftData.confidence 
        } : t
      ));
    } catch (e) {
      // Network error, fallback to drafted
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'drafted' } : t));
      alert('Network error during refinement.');
    }
  };

  const processDrafts = async (itemsToDraft: any[]) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    for (const item of itemsToDraft) {
      if (abortControllerRef.current.signal.aborted) break;
      
      try {
        const draftRes = await fetch('/api/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item }),
          signal: abortControllerRef.current.signal,
        });
        
        if (!draftRes.ok) throw new Error("Draft failed");
        
        const draftData = await draftRes.json();
        
        setTasks(prev => prev.map(t => 
          t.id === item.id ? { 
            ...t, 
            status: draftData.status === 'error' ? 'error' : 'drafted', 
            draft: draftData.draft, 
            toneLabel: draftData.toneLabel, 
            confidence: draftData.confidence 
          } : t
        ));
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          setTasks(prev => prev.map(t => 
            t.id === item.id ? { ...t, status: 'error' } : t
          ));
        }
      }
    }
  };

  const submitText = async (overrideText?: string) => {
    const textToProcess = overrideText || inputText;
    if (!textToProcess.trim()) return;
    
    setIsProcessing(true);

    try {
      const response = await fetch('/api/process-dump', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToProcess }),
      });

      const data = await response.json();
      
      if (!data.items || data.items.length === 0) {
         setIsProcessing(false);
         return;
      }

      // Add the new tasks to the UI
      const initTasks = data.items.map((i: any) => ({
        ...i,
        status: 'drafting'
      }));
      
      setTasks(prev => [...initTasks, ...prev]);
      setOverflowCount(data.overflow || 0);

      // Start drafting loop
      await processDrafts(data.items);
      logActivity();

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
          status: 'drafted', 
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

  const followUpTasks = tasks.filter(t => t.isFollowUp);
  const queueTasks = tasks.filter(t => !t.isFollowUp);

  return (
    <main className={styles.container}>
      <div className={styles.streakBadge}>
        <span style={{ fontSize: '1.2rem' }}>🔥</span>
        <strong style={{ fontSize: '1.1rem' }}>{streak}</strong>
        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>day streak</span>
      </div>

      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Ghostwriter Intern</h1>
          <p className={styles.subtitle}>Say your day out loud. Wake up to a done inbox.</p>
        </div>
      </header>

      <section className={styles.inputSection}>
        {tasks.length === 0 && !isProcessing && (
          <div className={`${styles.emptyStatePrompt} handwriting`}>
            Anything on your mind today?
          </div>
        )}
        <div className={styles.inputShortcutHint}>⌘K / Ctrl+K</div>
        <textarea
          ref={mainInputRef}
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
          {followUpTasks.length > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              <div className={styles.queueHeader}>
                <h2 className={styles.queueTitle} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3498db" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"></path><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                  Follow-ups
                </h2>
                <span className={styles.queueCount}>{followUpTasks.length} items</span>
              </div>
              {followUpTasks.map((task) => (
                <TaskCard 
                  key={task.id} 
                  task={task} 
                  onArchive={handleArchive}
                  onRetry={handleRetry}
                  onRefine={handleRefine}
                  onDismiss={handleDismiss}
                />
              ))}
            </div>
          )}

          <div className={styles.queueHeader}>
            <h2 className={styles.queueTitle}>
              {isProcessing && queueTasks.length === 0 ? 'Reading through your day...' : 'Approval Queue'}
            </h2>
            {queueTasks.length > 0 && (
              <span className={styles.queueCount}>{queueTasks.filter(t => t.status === 'drafted').length} ready</span>
            )}
          </div>
          
          {queueTasks.map((task) => (
            <TaskCard 
              key={task.id} 
              task={task} 
              onArchive={handleArchive}
              onRetry={handleRetry}
              onRefine={handleRefine}
            />
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
