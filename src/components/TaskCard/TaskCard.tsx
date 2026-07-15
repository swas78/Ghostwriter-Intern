'use client';

import { useState, useEffect } from 'react';
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
  archived?: number;
  follow_up_date?: string;
  isFollowUp?: boolean;
}

interface TaskCardProps {
  task: Task;
  onArchive?: (id: string, draft?: string, followUpDays?: number) => void;
  onRetry?: (id: string) => void;
  onRefine?: (id: string, instruction: string) => void;
  onDismiss?: (id: string) => void;
}

export function TaskCard({ task, onArchive, onRetry, onRefine, onDismiss }: TaskCardProps) {
  const [isApproved, setIsApproved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState(task.draft || '');
  const [recipient, setRecipient] = useState(task.recipient);
  const [refineInstruction, setRefineInstruction] = useState('');
  const [followUpDays, setFollowUpDays] = useState(0);

  useEffect(() => {
    if (task.draft) setDraftContent(task.draft);
  }, [task.draft]);

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
        <h3 className={`${styles.recipient} handwriting`} style={{ display: 'flex', alignItems: 'center' }}>
          For: 
          {task.recipient === 'unclear' ? (
            <input 
              type="text" 
              placeholder="Who is this for?" 
              value={recipient === 'unclear' ? '' : recipient}
              onChange={(e) => setRecipient(e.target.value)} 
              style={{ marginLeft: '8px', padding: '2px 6px', fontSize: '1rem', border: '1px dashed #e67e22', borderRadius: '4px', background: '#fff3e0', fontFamily: 'inherit' }}
            />
          ) : (
            <span style={{ marginLeft: '6px' }}>{recipient}</span>
          )}
        </h3>
        <span className={`${styles.urgencyBadge} ${urgencyClass}`}>
          {urgencyLabel}
        </span>
        {task.isFollowUp && (
          <span className={styles.followUpBadge} style={{ marginLeft: '8px', background: '#3498db', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600 }}>
            Follow-up
          </span>
        )}
      </div>

      <div className={styles.draftArea}>
        {task.status === 'drafting' ? (
          <div className={styles.typingIndicator}>
            <div className={styles.typingDot}></div>
            <div className={styles.typingDot}></div>
            <div className={styles.typingDot}></div>
          </div>
        ) : task.status === 'error' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <p className={styles.message} style={{ color: '#e55039', marginBottom: '8px' }}>
              Couldn't draft this one.
            </p>
            <button 
              className={`${styles.btn} ${styles.btnEdit}`} 
              onClick={() => onRetry && onRetry(task.id)}
            >
              Retry Draft
            </button>
          </div>
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

      {task.status === 'ready' || task.status === 'drafted' ? (
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
          
          {/* Refinement Area */}
          {!isApproved && !isEditing && task.status !== 'drafting' && (
            <div className={styles.refineArea}>
              <input 
                type="text" 
                className={styles.refineInput}
                placeholder="Refine draft (e.g. 'shorter', 'more professional')" 
                value={refineInstruction}
                onChange={(e) => setRefineInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && refineInstruction.trim() && onRefine) {
                    onRefine(task.id, refineInstruction.trim());
                    setRefineInstruction(''); // Clear input after triggering
                  }
                }}
              />
              <button 
                className={styles.btnRefine} 
                disabled={!refineInstruction.trim()}
                onClick={() => {
                  if (onRefine) {
                    onRefine(task.id, refineInstruction.trim());
                    setRefineInstruction('');
                  }
                }}
              >
                Refine
              </button>
            </div>
          )}

          <div className={styles.footer}>
            {task.isFollowUp ? (
              <button className={`${styles.btn} ${styles.btnSkip}`} onClick={() => onDismiss && onDismiss(task.id)}>
                Dismiss Reminder
              </button>
            ) : !isApproved ? (
              <>
                <button className={`${styles.btn} ${styles.btnSkip}`} onClick={() => onArchive && onArchive(task.id, draftContent)}>Skip</button>
                {isEditing ? (
                  <button className={`${styles.btn} ${styles.btnEdit}`} onClick={() => setIsEditing(false)}>Save</button>
                ) : (
                  <button className={`${styles.btn} ${styles.btnEdit}`} onClick={() => setIsEditing(true)}>Edit</button>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <select 
                    className={styles.followUpSelect} 
                    value={followUpDays} 
                    onChange={(e) => setFollowUpDays(Number(e.target.value))}
                  >
                    <option value={0}>No reminder</option>
                    <option value={1}>Remind in 1 day</option>
                    <option value={3}>Remind in 3 days</option>
                    <option value={7}>Remind in 1 week</option>
                  </select>
                  <button className={`${styles.btn} ${styles.btnApprove}`} onClick={() => {
                    setIsApproved(true);
                    if (onArchive) onArchive(task.id, draftContent, followUpDays);
                  }}>
                    Approve
                  </button>
                </div>
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
      ) : null}
    </div>
  );
}
