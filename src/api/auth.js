import { supabase } from '../lib/supabase'

export const MIN_PASSWORD_LENGTH = 6

export async function signIn({ email, password }) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

// 이름·팀은 user metadata로 넘기고, profiles 행은 DB 트리거(handle_new_user)가 그 팀 소속으로 생성한다
export async function signUp({ name, email, password, teamId }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, team_id: teamId } },
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

// 가입 직후 인증 메일을 못 받았거나 유효시간이 지났을 때 다시 보낸다.
export async function resendConfirmationEmail({ email }) {
  const { error } = await supabase.auth.resend({ type: 'signup', email })
  if (error) throw error
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  // 네트워크 오류 등으로 서버 로그아웃이 실패해도 기기에서는 반드시 로그아웃되게 한다
  if (error) await supabase.auth.signOut({ scope: 'local' })
}

// current_team_id: 지금 보고 있는 팀(개발자는 전환한 팀, 그 외는 소속 팀). 화면에 팀 이름을 띄우려고
// 팀 목록도 함께 받아 이름을 붙인다.
export async function fetchProfile(userId) {
  const [profileRes, teamsRes] = await Promise.all([
    supabase.from('profiles').select('name, phone, role, is_test_account, team_id, active_team_id').eq('id', userId).single(),
    supabase.rpc('list_teams'),
  ])
  if (profileRes.error) throw profileRes.error
  if (teamsRes.error) throw teamsRes.error

  const profile = profileRes.data
  const nameById = Object.fromEntries(teamsRes.data.map((team) => [team.id, team.name]))
  const currentTeamId = profile.role === '개발자' ? (profile.active_team_id ?? profile.team_id) : profile.team_id
  return {
    ...profile,
    team_name: nameById[profile.team_id] ?? '',
    current_team_id: currentTeamId,
    current_team_name: nameById[currentTeamId] ?? '',
  }
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
