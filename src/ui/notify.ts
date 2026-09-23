export function playChime(): void {
  const Context = window.AudioContext || window.webkitAudioContext
  if (!Context) return
  const audio = new Context()
  const oscillator = audio.createOscillator()
  const gain = audio.createGain()
  const now = audio.currentTime
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(494, now)
  oscillator.frequency.exponentialRampToValueAtTime(370, now + 0.18)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.03, now + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32)
  oscillator.connect(gain)
  gain.connect(audio.destination)
  oscillator.start(now)
  oscillator.stop(now + 0.34)
  oscillator.onended = () => {
    void audio.close()
  }
}

export function downloadText(filename: string, contents: string, type: string): void {
  const blob = new Blob([contents], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}
