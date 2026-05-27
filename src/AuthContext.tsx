/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { logoutRequest } from "./pages/Dashboard/api";
import { useSetupStore } from "./store/useSetupStore";
import { useUserStore } from "./store/userStore";

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  setUser: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem("misty_user");
    return stored ? (JSON.parse(stored) as User) : null;
  });
  const navigate = useNavigate();
  const signOut = useSetupStore((state) => state.signOut);

  useEffect(() => {
    if (user) {
      localStorage.setItem("misty_user", JSON.stringify(user));
    } else {
      localStorage.removeItem("misty_user");
    }
  }, [user]);

  const logout = useCallback(() => {
    logoutRequest().catch(() => {});
    useUserStore.getState().clear();
    void signOut();
    setUser(null);
    navigate("/");
  }, [navigate, signOut]);

  return <AuthContext.Provider value={{ user, setUser, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
