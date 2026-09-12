// beforeinstallprompt는 페이지가 열리자마자(사용자가 아직 설정 화면에 들어오기 전에) 딱 한 번
// 발생할 수 있다. 설정 페이지가 마운트된 뒤에야 리스너를 붙이면 그 사이에 이벤트를 놓쳐서
// "지금 설치하기" 버튼이 영영 안 뜨는 문제가 있었다. 그래서 앱이 켜지자마자(main.jsx에서
// 이 모듈을 import하는 시점) 최상위에서 미리 붙잡아두고, 구독한 컴포넌트에 나중에 알려준다.
let deferredPrompt = null
const listeners = new Set()

function notify() {
  listeners.forEach((listener) => listener(deferredPrompt))
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferredPrompt = e
  notify()
})

window.addEventListener('appinstalled', () => {
  deferredPrompt = null
  notify()
})

export function getInstallPrompt() {
  return deferredPrompt
}

export function onInstallPromptChange(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export async function triggerInstallPrompt() {
  if (!deferredPrompt) return null
  const prompt = deferredPrompt
  prompt.prompt()
  const choice = await prompt.userChoice
  deferredPrompt = null
  notify()
  return choice
}
