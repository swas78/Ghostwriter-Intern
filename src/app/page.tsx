'use client';

import { useState } from 'react';
import styles from './page.module.css';
import { TaskCard, Task } from '@/components/TaskCard/TaskCard';

const mockTasks: Task[] = [
  {
    id: '1',
    recipient: 'Priya',
    intent: 'reply about invoice',
    urgency: 4,
    status: 'ready',
    draft: 'Hi Priya,\n\nSo sorry for the delay on this. I will get that invoice sorted and sent over to you by the end of the day tomorrow at the latest.\n\nThanks for your patience!',
    toneLabel: 'Professional & Apologetic',
    confidence: 'high'
  },
  {
    id: '2',
    recipient: 'Rahul',
    intent: 'cancel dinner',
    urgency: 2,
    status: 'ready',
    draft: 'Hey man, I\'m so sorry but I\'m not going to be able to make it to dinner tonight. Work completely blew up on me. Let\'s reschedule for next week?',
    toneLabel: 'Casual & Warm',
    confidence: 'low'
  },
  {
    id: '3',
    recipient: 'The Plumber',
    intent: 'call back',
    urgency: 5,
    status: 'drafting'
  }
];

export default function Home() {
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [tasks, setTasks] = useState<Task[]>(mockTasks);

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
        />
        <div className={styles.inputFooter}>
          <button 
            className={`${styles.recordBtn} ${isRecording ? styles.recording : ''}`}
            onClick={() => setIsRecording(!isRecording)}
          >
            <span className={styles.recordIcon}>
              {isRecording && <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><rect x="6" y="6" width="12" height="12"></rect></svg>}
            </span>
            {isRecording ? 'Listening...' : 'Record voice note'}
          </button>
          
          <button className={styles.submitBtn}>
            Sort my day
          </button>
        </div>
      </section>

      {tasks.length > 0 && (
        <section className={styles.queueSection}>
          <div className={styles.queueHeader}>
            <h2 className={styles.queueTitle}>Approval Queue</h2>
            <span className={styles.queueCount}>{tasks.filter(t => t.status === 'ready').length} ready</span>
          </div>
          
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </section>
      )}
    </main>
  );
}
