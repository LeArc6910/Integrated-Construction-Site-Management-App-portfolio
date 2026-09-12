// DB에 저장되는 권한 값과 반드시 일치시킬 것
export const ROLES = {
  MEMBER: '팀원',
  LEADER: '팀장',
  DEVELOPER: '개발자',
}

export const ALL_ROLES = [ROLES.MEMBER, ROLES.LEADER, ROLES.DEVELOPER]
export const MANAGER_ROLES = [ROLES.LEADER, ROLES.DEVELOPER]
