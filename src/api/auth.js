import { supabase } from '../lib/supabase'

export const MIN_PASSWORD_LENGTH = 6

export async function signIn({ email, password }) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

// 이름은 user metadata로 넘기고, profiles 행은 DB 트리거(handle_new_user)가 생성한다
export async function signUp({ name, email, password }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  })
  if (error) throw error

  // 이메일 인증이 켜져 있으면 이미 가입된 이메일도 에러 없이 identities가 빈 사용자로 응답된다
  if (data.user && data.user.identities?.length === 0) {
    const duplicated = new Error('User already registered')
    duplicated.code = 'user_already_exists'
    throw duplicated
  }
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  // 네트워크 오류 등으로 서버 로그아웃이 실패해도 기기에서는 반드시 로그아웃되게 한다
  if (error) await supabase.auth.signOut({ scope: 'local' })
}

export async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('name, phone, role, is_test_account')
    .eq('id', userId)
    .single()
  if (error) throw error
  return data
}

export async function updateProfile({ userId, name, phone }) {
  const { error } = await supabase.from('profiles').update({ name, phone }).eq('id', userId)
  if (error) throw error
}

export async function updatePassword({ password }) {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
}

// 오프라인 상태에서 작업하다가 다시 접속했을 때 서버와 연결이 살아있는지 확인하는 용도.
// 별도의 로컬 캐시가 없어서 실제로 "동기화"할 데이터는 없고, 연결 확인 후 시각만 갱신한다.
export async function pingSync() {
  const { error } = await supabase.from('profiles').select('id').limit(1)
  if (error) throw error
}

const AUTH_ERROR_MESSAGES = {
  invalid_credentials: 'ID 또는 비밀번호가 올바르지 않습니다.',
  email_not_confirmed: '이메일 인증이 완료되지 않았습니다. 메일함을 확인해주세요.',
  user_already_exists: '이미 가입된 ID입니다.',
  email_exists: '이미 가입된 ID입니다.',
  weak_password: '비밀번호가 너무 단순합니다. 더 길고 복잡하게 설정해주세요.',
  email_address_invalid: '사용할 수 없는 이메일 주소입니다.',
  signup_disabled: '현재 회원가입이 중단된 상태입니다. 관리자에게 문의해주세요.',
  over_email_send_rate_limit: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
  over_request_rate_limit: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
}

export function getAuthErrorMessage(error) {
  return AUTH_ERROR_MESSAGES[error?.code] ?? '오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
}
