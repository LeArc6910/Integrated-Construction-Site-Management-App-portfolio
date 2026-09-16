import { supabase } from '../lib/supabase'

// 팀끼리는 데이터가 전혀 보이지 않는다(DB의 "팀 격리" 정책). 한 사람은 한 팀 전속이고,
// 개발자만 "지금 보고 있는 팀"을 바꿔 다른 팀 데이터를 볼 수 있다.

// 가입 화면(로그인 전)에서도 호출된다. 팀 이름만 돌려준다.
export async function listTeams() {
  const { data, error } = await supabase.rpc('list_teams')
  if (error) throw error
  return data
}

// 이하 개발자 전용. DB 함수 안에서도 개발자인지 다시 확인한다.
export async function createTeam({ name }) {
  const { data, error } = await supabase.rpc('create_team', { team_name: name })
  if (error) throw error
  return data
}

// teamId가 null이면 자기 소속 팀으로 돌아간다
export async function switchActiveTeam({ teamId }) {
  const { error } = await supabase.rpc('switch_active_team', { target_team_id: teamId })
  if (error) throw error
}

export async function listAllMembers() {
  const { data, error } = await supabase.rpc('list_all_members')
  if (error) throw error
  return data
}

export async function setUserTeam({ userId, teamId }) {
  const { error } = await supabase.rpc('set_user_team', { target_user_id: userId, target_team_id: teamId })
  if (error) throw error
}
