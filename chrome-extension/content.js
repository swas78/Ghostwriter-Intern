// Only inject the pill once
if (!document.getElementById('ghostwriter-capture-pill')) {
  const pill = document.createElement('div');
  pill.id = 'ghostwriter-capture-pill';
  pill.className = 'gw-pill gw-hidden';
  
  pill.innerHTML = `
    <div class="gw-icon-container">
      <div class="gw-waveform" id="gw-waveform">
        <div class="gw-bar" id="gw-bar-0"></div>
        <div class="gw-bar" id="gw-bar-1"></div>
        <div class="gw-bar" id="gw-bar-2"></div>
        <div class="gw-bar" id="gw-bar-3"></div>
      </div>
      <div class="gw-spinner" id="gw-spinner"></div>
    </div>
    <div class="gw-text" id="gw-text">Listening...</div>
  `;
  document.body.appendChild(pill);
}

let timeoutId;

chrome.runtime.onMessage.addListener((message) => {
  const pill = document.getElementById('ghostwriter-capture-pill');
  if (!pill) return;
  const textEl = document.getElementById('gw-text');
  const waveformEl = document.getElementById('gw-waveform');
  const spinnerEl = document.getElementById('gw-spinner');

  if (message.type === 'ui_state') {
    pill.classList.remove('gw-hidden');
    pill.classList.remove('gw-error');
    clearTimeout(timeoutId);

    if (message.state === 'listening') {
      textEl.textContent = 'Listening...';
      waveformEl.style.display = 'flex';
      spinnerEl.style.display = 'none';
    } 
    else if (message.state === 'transcribing') {
      textEl.textContent = 'Transcribing...';
      waveformEl.style.display = 'none';
      spinnerEl.style.display = 'block';
    }
    else if (message.state === 'done') {
      textEl.textContent = 'Done!';
      waveformEl.style.display = 'none';
      spinnerEl.style.display = 'none';
      timeoutId = setTimeout(() => {
        pill.classList.add('gw-hidden');
      }, 1500);
    }
    else if (message.state === 'error') {
      textEl.textContent = message.error || 'Error occurred';
      waveformEl.style.display = 'none';
      spinnerEl.style.display = 'none';
      pill.classList.add('gw-error');
      timeoutId = setTimeout(() => {
        pill.classList.add('gw-hidden');
      }, 3000);
    }
  }

  if (message.type === 'no_audio_warning' && textEl.textContent === 'Listening...') {
    textEl.textContent = 'No audio detected — check your mic';
  }

  if (message.type === 'volume_update' && waveformEl.style.display !== 'none') {
    // Map volume [0, 255] to height [4px, 16px]
    const bars = message.bars;
    for (let i = 0; i < 4; i++) {
      const barEl = document.getElementById(`gw-bar-${i}`);
      if (barEl) {
        // scale height exponentially a bit for better visuals
        const val = bars[i] / 255; 
        const height = 4 + (val * 16);
        barEl.style.height = `${height}px`;
      }
    }
  }
});
