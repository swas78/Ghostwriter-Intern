document.getElementById('grantBtn').addEventListener('click', async () => {
  const statusMsg = document.getElementById('statusMsg');
  statusMsg.textContent = 'Requesting...';
  statusMsg.className = 'status';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Stop tracks immediately since we only needed permission
    stream.getTracks().forEach(track => track.stop());
    
    statusMsg.textContent = 'Permission granted! You can now close this page and use the shortcut on any website.';
    statusMsg.className = 'status success';
  } catch (err) {
    statusMsg.textContent = 'Permission denied. Please check your browser settings or click the microphone icon in the address bar.';
    statusMsg.className = 'status error';
    console.error('Permission error:', err);
  }
});
