let audioContext;

export function playPlacementSound() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  try {
    audioContext ??= new AudioContextClass();
    if (audioContext.state === 'suspended') void audioContext.resume().catch(() => {});

    const start = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(580, start);
    oscillator.frequency.exponentialRampToValueAtTime(320, start + 0.11);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.075, start + 0.009);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.15);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(start);
    oscillator.stop(start + 0.15);
  } catch {
    // El juego sigue funcionando si el navegador no permite reproducir audio.
  }
}
