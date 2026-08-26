// Timer Web Worker - läuft ungedrosselt im Hintergrund
let timerInterval = null;
let endTime = null;

self.onmessage = function(e) {
  const { action, data } = e.data;

  switch (action) {
    case 'start':
      endTime = data.endTime;
      startTicking();
      break;

    case 'stop':
      stopTicking();
      break;

    case 'updateEndTime':
      endTime = data.endTime;
      break;
  }
};

function startTicking() {
  stopTicking(); // Clear any existing interval

  timerInterval = setInterval(() => {
    if (!endTime) return;

    const now = Date.now();
    const remaining = Math.max(0, Math.floor((endTime - now) / 1000));

    // Send tick to main thread
    self.postMessage({ type: 'tick', remaining });

    // Check if timer completed
    if (remaining <= 0) {
      self.postMessage({ type: 'complete' });
      stopTicking();
    }
  }, 1000);
}

function stopTicking() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}
