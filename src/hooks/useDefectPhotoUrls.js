import { useEffect, useState } from 'react'
import { defectPhotoUrls } from '../api/unitSheet'

// 미타공 사진의 보기 주소를 받아 온다. 연결이 없으면 주소 없이 두고(화면에는 "사진"으로만 보인다),
// 한 번 받은 주소는 이 화면에 있는 동안 다시 쓴다(주소는 10분 동안 쓸 수 있다).
export function useDefectPhotoUrls(defects) {
  const key = defects
    .flatMap((defect) => defect.photo_paths ?? [])
    .filter(Boolean)
    .join('|')
  const [urls, setUrls] = useState({})

  useEffect(() => {
    if (!key) return
    let ignore = false
    defectPhotoUrls(key.split('|'))
      .then((result) => !ignore && setUrls((prev) => ({ ...prev, ...result })))
      .catch(() => {
        // 사진 주소를 못 받아도 미타공 내용은 그대로 보여준다
      })
    return () => {
      ignore = true
    }
  }, [key])

  return urls
}
