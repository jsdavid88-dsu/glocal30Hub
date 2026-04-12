import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

export type Role = 'admin' | 'professor' | 'student' | 'external'

interface RoleContextType {
  currentRole: Role
  setRole: (role: Role) => void
}

const RoleContext = createContext<RoleContextType>({
  currentRole: 'professor',
  setRole: () => {},
})

export function RoleProvider({ children }: { children: ReactNode }) {
  const [currentRole, setRole] = useState<Role>('professor')

  // Sync from token on mount
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        const role = payload.role as Role
        if (['admin', 'professor', 'student', 'external'].includes(role)) {
          setRole(role)
        }
      } catch {}
    }
  }, [])

  return (
    <RoleContext.Provider value={{ currentRole, setRole }}>
      {children}
    </RoleContext.Provider>
  )
}

export function useRole() {
  return useContext(RoleContext)
}
