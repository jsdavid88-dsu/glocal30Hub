import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { RoleProvider } from './contexts/RoleContext'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Projects from './pages/Projects'
import Profile from './pages/Profile'
import DailyWrite from './pages/DailyWrite'
import DailyFeed from './pages/DailyFeed'
import Members from './pages/Members'
import Calendar from './pages/Calendar'
import Attendance from './pages/Attendance'
import Weekly from './pages/Weekly'

function App() {
  return (
    <RoleProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/daily/write" element={<DailyWrite />} />
            <Route path="/daily/feed" element={<DailyFeed />} />
            <Route path="/members" element={<Members />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/weekly" element={<Weekly />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </RoleProvider>
  )
}

export default App
