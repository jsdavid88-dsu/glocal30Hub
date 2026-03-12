import { createContext, useContext, useState, type ReactNode } from 'react'

export type Role = 'professor' | 'student' | 'external'

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

  return (
    <RoleContext.Provider value={{ currentRole, setRole }}>
      {children}
    </RoleContext.Provider>
  )
}

export function useRole() {
  return useContext(RoleContext)
}
