export default function Login() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">R&D Hub</h1>
        <button
          onClick={() => window.location.href = '/api/v1/auth/login'}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition"
        >
          Google 계정으로 로그인
        </button>
      </div>
    </div>
  )
}
