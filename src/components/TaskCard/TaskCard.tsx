'use client';

import { useState } from 'react';
import styles from './TaskCard.module.css';

export interface Task {
  id: string;
  recipient: string;
  intent: string;
  urgency: number; // 1-5
  status: 'extracting' | 'drafting' | 'ready' | 'error';
  draft?: string;
  toneLabel?: string;
  confidence?: 'high' | 'low';
}

interface TaskCardProps {
  task: Task;
}

export function TaskCard({ task }: TaskCardProps) {
  const [isApproved, setIsApproved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState(task.draft || '');

  const urgencyClass = 
    task.urgency >= 4 ? styles.urgencyHigh : 
    task.urgency === 3 ? styles.urgencyMed : 
    styles.urgencyLow;

  const urgencyLabel = 
    task.urgency >= 4 ? 'High Priority' : 
    task.urgency === 3 ? 'Medium Priority' : 
    'Low Priority';

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <h3 className={`${styles.recipient} handwriting`}>For: {task.recipient}</h3>
        <span className={`${styles.urgencyBadge} ${urgencyClass}`}>
          {urgencyLabel}
        </span>
      </div>

      <div className={styles.draftArea}>
        {task.status === 'drafting' ? (
          <div className={styles.typingIndicator}>
            <div className={styles.typingDot}></div>
            <div className={styles.typingDot}></div>
            <div className={styles.typingDot}></div>
          </div>
        ) : task.status === 'error' ? (
          <p className={styles.message} style={{ color: '#e55039' }}>
            Couldn't draft this one. Retry?
          </p>
        ) : (
          isEditing ? (
            <textarea 
              className={styles.message} 
              style={{ width: '100%', minHeight: '80px', border: '1px solid #c2c2c0', padding: '8px', borderRadius: '4px' }}
              value={draftContent}
              onChange={(e) => setDraftContent(e.target.value)}
              autoFocus
            />
          ) : (
            <p className={styles.message}>{draftContent}</p>
          )
        )}
      </div>

      {task.status === 'ready' && (
        <>
          <div className={styles.meta}>
            {task.toneLabel && (
              <span className={styles.toneLabel}>{task.toneLabel}</span>
            )}
            {task.confidence === 'low' && (
              <span className={styles.confidenceFlag}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                Check tone
              </span>
            )}
          </div>
          <div className={styles.footer}>
            {!isApproved ? (
              <>
                <button className={`${styles.btn} ${styles.btnSkip}`}>Skip</button>
                {isEditing ? (
                  <button className={`${styles.btn} ${styles.btnEdit}`} onClick={() => setIsEditing(false)}>Save</button>
                ) : (
                  <button className={`${styles.btn} ${styles.btnEdit}`} onClick={() => setIsEditing(true)}>Edit</button>
                )}
                <button className={`${styles.btn} ${styles.btnApprove}`} onClick={() => setIsApproved(true)}>
                  Approve
                </button>
              </>
            ) : (
              <>
                <span style={{ display: 'inline-flex', alignItems: 'center', color: '#3a8b5a', fontSize: '0.9rem', marginRight: '8px' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}><polyline points="20 6 9 17 4 12"></polyline></svg>
                  Approved
                </span>
                <button className={`${styles.btn} ${styles.btnCopy}`} onClick={() => navigator.clipboard.writeText(draftContent)}>
                  Copy to clipboard
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
