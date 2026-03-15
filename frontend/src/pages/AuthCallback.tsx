import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    if (token) {
      localStorage.setItem('token', token)
      navigate('/', { replace: true })
    } else {
      navigate('/login', { replace: true })
    }
  }, [navigate])

  return (
    <div className="flex items-center justify-center h-screen">
      <p className="text-gray-500">로그인 중...</p>
    </div>
  )
}
